import { prisma } from '../lib/prisma.js';
import { job_state, job_type } from '@prisma/client';
import { pathToFileURL } from 'node:url';
import { runAsrForTrack } from '../services/asr.service.js';
import { reconcileRecordingReadiness } from '../services/recording-readiness.service.js';
import {
    beginTranscriptRevision,
    markTranscriptRevisionFailed,
    publishTranscriptRevision,
    resolveTranscriptSourceForTrack,
} from '../services/transcript-asset.service.js';
import { emitTelemetry } from '../lib/telemetry.js';

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

const WORKER_NAME = 'asr-worker';
const MAX_ATTEMPTS = 3;
const POLL_MS = 300;

let stopping = false;
process.on('SIGINT', () => (stopping = true));
process.on('SIGTERM', () => (stopping = true));

async function claimOneAsrJob(): Promise<JobRow | null> {
    return prisma.$transaction(async (tx) => {
        const job = await tx.job.findFirst({
            where: { type: job_type.asr, state: job_state.queued },
            orderBy: { created_at: 'asc' },
        });
        if (!job) return null;

        const updated = await tx.job.update({
            where: { id: job.id },
            data: {
                state: job_state.running,
                attempts: { increment: 1 },
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

    // Load the track
    const track = await prisma.track.findUnique({
        where: { id: payload.trackId },
        select: {
            id: true,
            recording_id: true,
            participant_id: true,
            storage_key_final: true,
            duration_ms: true,
        },
    });

    if (!track || !track.storage_key_final) {
        const err = new Error('track_not_found_or_no_final');
        (err as any).code = 'not_found';
        throw err;
    }

    const source = await resolveTranscriptSourceForTrack({
        recordingId: track.recording_id,
        trackId: track.id,
        participantId: track.participant_id,
        fallbackTrackStorageKey: track.storage_key_final,
    });

    const revision = await beginTranscriptRevision({
        recordingId: track.recording_id,
        trackId: source.trackId,
        sourceType: source.type,
        sourceAssetId: source.assetId,
        sourceStorageKey: source.storageKey,
        language: 'en',
    });

    try {
        const { segments } = await runAsrForTrack({
            sourceStorageKey: source.storageKey,
            sourceType: source.type,
            durationMs: track.duration_ms,
            language: 'en',
        });

        await publishTranscriptRevision({
            transcriptId: revision.id,
            recordingId: track.recording_id,
            trackId: source.trackId,
            language: 'en',
            segments,
            storageKey: null,
        });

        await reconcileRecordingReadiness(track.recording_id);
    } catch (err) {
        const message = (err as Error)?.message ?? 'asr_generation_failed';
        await markTranscriptRevisionFailed({
            transcriptId: revision.id,
            reason: message,
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
            state: attemptsLeft ? job_state.queued : job_state.failed,
            last_error: message.slice(0, 8000),
        },
    });

    await reconcileRecordingReadiness(job.recording_id);
}

export async function runAsrWorker() {
    emitTelemetry({
        event: 'worker.started',
        message: `[${WORKER_NAME}] starting`,
        worker: WORKER_NAME,
    });

    while (!stopping) {
        try {
            const job = await claimOneAsrJob();
            if (job) {
                try {
                    emitTelemetry({
                        event: 'worker.job.running',
                        message: `[${WORKER_NAME}] running job`,
                        worker: WORKER_NAME,
                        jobId: job.id,
                        recordingId: job.recording_id,
                    });
                    await runJob(job);
                    await succeed(job.id);
                    emitTelemetry({
                        event: 'worker.job.succeeded',
                        message: `[${WORKER_NAME}] job succeeded`,
                        worker: WORKER_NAME,
                        jobId: job.id,
                        recordingId: job.recording_id,
                    });
                } catch (err) {
                    emitTelemetry({
                        level: 'error',
                        event: 'worker.job.failed',
                        message: `[${WORKER_NAME}] job failed`,
                        worker: WORKER_NAME,
                        jobId: job.id,
                        recordingId: job.recording_id,
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

// Allow `node dist/workers/asr.worker.js` to run the loop (ESM-style)
const isMain =
    process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
    runAsrWorker().catch((e) => {
        emitTelemetry({
            level: 'error',
            event: 'worker.fatal',
            message: '[asr-worker] fatal',
            worker: WORKER_NAME,
            err: e,
        });
        process.exit(1);
    });
}
