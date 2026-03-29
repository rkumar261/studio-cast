import { prisma } from '../lib/prisma.js';
import { runTranscodeForTrack } from './transcode.runner.js';
import { job_state, job_type, track_state } from '@prisma/client';
import { pathToFileURL } from 'node:url';
import { enqueueAsrJob } from '../repositories/job.repo.js';
import { reconcileRecordingReadiness } from '../services/recording-readiness.service.js';
import {
    reconcileParticipantMasterAsset,
    selectParticipantMasterTrack,
} from '../services/participant-asset.service.js';
import { emitTelemetry } from '../lib/telemetry.js';
import { buildParticipantMasterKey } from '../lib/public-assets.js';

type JobRow = {
    id: string;
    recording_id: string;
    type: job_type;
    state: job_state;
    payload_json: any;
    attempts: number;
    last_error: string | null;
    created_at: Date;
};

const WORKER_NAME = 'transcode-worker';
const MAX_ATTEMPTS = 3;
const POLL_MS = 300;

let stopping = false;
process.on('SIGINT', () => (stopping = true));
process.on('SIGTERM', () => (stopping = true));

async function claimOneTranscodeJob(): Promise<JobRow | null> {
    // Atomically pick the next queued job and mark it running + bump attempts
    return prisma.$transaction(async (tx) => {
        const job = await tx.job.findFirst({
            where: { type: job_type.transcode, state: job_state.queued },
            orderBy: { created_at: 'asc' },
        });
        if (!job) return null;

        const updated = await tx.job.update({
            where: { id: job.id },
            data: {
                state: job_state.running,
                attempts: { increment: 1 },
                // (no worker/started_at fields in your schema)
            },
        });

        return updated as unknown as JobRow;
    });
}

async function runJob(job: JobRow) {
    const payload = (job.payload_json ?? {}) as { trackId?: string };

    if (!payload.trackId) {
        const err = new Error('payload_missing_trackId');
        (err as any).code = 'bad_payload';
        throw err;
    }

    const track = await prisma.track.findUnique({
        where: { id: payload.trackId },
        select: {
            id: true,
            recording_id: true,
            participant_id: true,
            kind: true,
            storage_key_raw: true,
            storage_key_final: true,
            state: true,
            recording_started_at: true,
            recording: {
                select: { stopped_at: true },
            },
        },
    });

    if (!track || !track.storage_key_raw) {
        const err = new Error('track_not_found_or_no_raw');
        (err as any).code = 'not_found';
        throw err;
    }

    const participant = await prisma.participant.findUnique({
        where: { id: track.participant_id },
        select: {
            id: true,
            role: true,
            track: {
                orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
                select: {
                    id: true,
                    kind: true,
                    created_at: true,
                },
            },
        },
    });
    const masterTrack = participant ? selectParticipantMasterTrack(participant.track) : undefined;
    const isParticipantMasterTrack = masterTrack?.id === track.id;

    await reconcileParticipantMasterAsset({
        recordingId: track.recording_id,
        participantId: track.participant_id,
        processingTrackId: isParticipantMasterTrack ? track.id : undefined,
    });

    try {
        const finalKeyOverride = isParticipantMasterTrack
            ? buildParticipantMasterKey({
                recordingId: track.recording_id,
                participantId: track.participant_id,
                extension: track.kind === 'audio' ? '.wav' : '.mp4',
            })
            : undefined;

        // Do the actual transcode (ffmpeg + upload final to R2)
        const out = await runTranscodeForTrack({
            id: track.id,
            recording_id: track.recording_id,
            storage_key_raw: track.storage_key_raw,
            finalKeyOverride,
            // upload.storage_bucket is on upload model; not needed here
        });

        // Derive simple fields we can persist with your current schema
        const codec =
            out.kind === 'video'
                ? (out.probe.streams.find((s) => s.codec_type === 'video')?.codec_name ?? null)
                : (out.probe.streams.find((s) => s.codec_type === 'audio')?.codec_name ?? null);

        const duration_ms =
            typeof out.durationSec === 'number' && isFinite(out.durationSec)
                ? Math.round(out.durationSec * 1000)
                : null;
        const resolution =
            typeof out.width === 'number' && typeof out.height === 'number'
                ? `${out.width}x${out.height}`
                : null;

        // Persist final key + mark processed
        const now = new Date();
        await prisma.track.update({
            where: { id: track.id },
            data: {
                storage_key_final: out.finalKey,
                state: track_state.processed,
                transcoded_at: now,
                ready_at: now,
                failed_at: null,
                failure_reason: null,
                lifecycle_state: 'processed',
                codec: codec ?? undefined,
                duration_ms: duration_ms ?? undefined,
            },
        });

        // P2: flag duration deviation if recording_started_at and stopped_at are known.
        // P4/P5: quality warnings (audioWarning, videoWarning) are added by runTranscodeForTrack
        // and passed here as part of qualityWarnings.
        const qualityWarnings: Record<string, unknown> = {};
        if (out.qualityWarnings) {
            Object.assign(qualityWarnings, out.qualityWarnings);
        }
        if (
            track.recording_started_at &&
            track.recording?.stopped_at &&
            duration_ms != null
        ) {
            const expectedMs =
                track.recording.stopped_at.getTime() - track.recording_started_at.getTime();
            // Hosts are expected to record the full session; use a tight 5s tolerance.
            // Guests may join late (their recording_started_at reflects the session start,
            // not their actual join time), so use a 30s tolerance to avoid false positives.
            const isHost = participant?.role === 'host';
            const toleranceMs = isHost ? 5_000 : 30_000;
            if (Math.abs(duration_ms - expectedMs) > toleranceMs) {
                qualityWarnings.durationWarning = true;
            }
        }

        await reconcileParticipantMasterAsset({
            recordingId: track.recording_id,
            participantId: track.participant_id,
            readySource: {
                trackId: track.id,
                storageKey: out.finalKey,
                previewKey: out.finalKey,
                durationMs: duration_ms ?? undefined,
                resolution: resolution ?? undefined,
                metadata: {
                    codec: codec ?? undefined,
                    contentType: out.contentType,
                    width: out.width ?? undefined,
                    height: out.height ?? undefined,
                    ...(Object.keys(qualityWarnings).length > 0 ? { qualityWarnings } : {}),
                },
                exportSet: out.kind === 'video' ? ['mp4'] : ['wav'],
            },
        });

        // Enqueue follow-up ASR job.
        await enqueueAsrJob(track.recording_id, track.id);
        await reconcileRecordingReadiness(track.recording_id);
    } catch (err) {
        const reason = (err as Error)?.message ?? 'participant_asset_transcode_failed';
        await prisma.track.update({
            where: { id: track.id },
            data: {
                failed_at: new Date(),
                failure_reason: reason.slice(0, 1000),
                lifecycle_state: 'blocked',
            },
        }).catch(() => {});
        await reconcileParticipantMasterAsset({
            recordingId: track.recording_id,
            participantId: track.participant_id,
            failedTrackId: track.id,
            failureReason: reason,
        }).catch(() => {});
        throw err;
    }
}

async function succeed(jobId: string) {
    await prisma.job.update({
        where: { id: jobId },
        data: {
            state: job_state.succeeded,
            last_error: null,
        },
    });
}

async function fail(job: JobRow, err: any) {
    const attemptsLeft = MAX_ATTEMPTS - job.attempts > 0;
    const message = (err?.code ? `${err.code}: ` : '') + (err?.message || String(err));

    await prisma.job.update({
        where: { id: job.id },
        data: {
            state: attemptsLeft ? job_state.queued : job_state.failed, // or job_state.dead if you prefer
            last_error: message.slice(0, 8000),
        },
    });
}

export async function runTranscodeWorker() {
    emitTelemetry({
        event: 'worker.started',
        message: `[${WORKER_NAME}] starting`,
        worker: WORKER_NAME,
    });

    while (!stopping) {
        try {
            const job = await claimOneTranscodeJob();
            if (job) {
                try {
                    emitTelemetry({
                        event: 'worker.job.running',
                        message: `[${WORKER_NAME}] running job`,
                        worker: WORKER_NAME,
                        recordingId: job.recording_id,
                        jobId: job.id,
                    });
                    await runJob(job);
                    await succeed(job.id);
                    emitTelemetry({
                        event: 'worker.job.succeeded',
                        message: `[${WORKER_NAME}] job succeeded`,
                        worker: WORKER_NAME,
                        recordingId: job.recording_id,
                        jobId: job.id,
                    });
                } catch (err) {
                    emitTelemetry({
                        level: 'error',
                        event: 'worker.job.failed',
                        message: `[${WORKER_NAME}] job failed`,
                        worker: WORKER_NAME,
                        recordingId: job.recording_id,
                        jobId: job.id,
                        err,
                    });
                    await fail(job, err);
                }
            }
        } catch (loopErr) {
            emitTelemetry({
                level: 'error',
                event: 'worker.loop.error',
                message: `[${WORKER_NAME}] loop error`,
                worker: WORKER_NAME,
                err: loopErr,
            });
        }

        if (stopping) break;
        await new Promise((r) => setTimeout(r, POLL_MS));
    }

    emitTelemetry({
        event: 'worker.stopped',
        message: `[${WORKER_NAME}] stopping`,
        worker: WORKER_NAME,
    });
}

// // Allow `node dist/workers/transcode.worker.js` to run the loop
// if (process.argv[1]?.endsWith('transcode.worker.js')) {
//     runTranscodeWorker().catch((e) => {
//         console.error(`[${WORKER_NAME}] fatal`, e);
//         process.exit(1);
//     });
// }

const isMain = process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  runTranscodeWorker().catch((e) => {
    emitTelemetry({
      level: 'error',
      event: 'worker.fatal',
      message: '[transcode-worker] fatal',
      worker: WORKER_NAME,
      err: e,
    });
    process.exit(1);
  });
}
