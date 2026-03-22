import { prisma } from '../lib/prisma.js';
import {
    job_state,
    job_type,
    export_state,
    export_type,
    track_kind,
    track_state, // added
} from '@prisma/client';
import { pathToFileURL } from 'node:url';
import { renderCaptionsExportForRecording } from '../services/captions.service.js';
import { reconcileRecordingReadiness } from '../services/recording-readiness.service.js';
import { renderStandardExportForRecording } from '../services/standard-exports.service.js';
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

const WORKER_NAME = 'export-worker';
const MAX_ATTEMPTS = 3;
const POLL_MS = 300;

let stopping = false;
process.on('SIGINT', () => (stopping = true));
process.on('SIGTERM', () => (stopping = true));

async function claimOneExportJob(): Promise<JobRow | null> {
    return prisma.$transaction(async (tx) => {
        const job = await tx.job.findFirst({
            where: { type: job_type.export, state: job_state.queued },
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
    const payload = (job.payload_json ?? {}) as {
        exportId?: string;
        type?: export_type;
    };

    if (!payload.exportId) {
        const err = new Error('payload_missing_exportId');
        (err as any).code = 'bad_payload';
        throw err;
    }

    // Load export artifact
    let artifact = await prisma.export_artifact.findUnique({
        where: { id: payload.exportId },
    });

    if (!artifact) {
        const err = new Error('export_not_found');
        (err as any).code = 'not_found';
        throw err;
    }

    // Idempotency: if already succeeded with a storage key, nothing to do.
    if (artifact.state === export_state.succeeded && artifact.storage_key) {
        return;
    }

    // Mark export as running
    const startedAt = new Date();
    artifact = await prisma.export_artifact.update({
        where: { id: artifact.id },
        data: {
            state: export_state.running,
            last_error: null,
            started_at: startedAt,
            failed_at: null,
            failure_reason: null,
        },
    });

    let resolvedCombinedAssetId = artifact.combined_asset_id ?? null;
    let resolvedParticipantAssetId = artifact.participant_asset_id ?? null;
    let sourceStorageKey: string | null = null;

    if (artifact.participant_asset_id) {
        const participantAsset = await prisma.participant_asset.findUnique({
            where: { id: artifact.participant_asset_id },
            select: {
                id: true,
                state: true,
                storage_key: true,
            },
        });
        if (participantAsset?.state !== 'ready' || !participantAsset.storage_key) {
            const err = new Error('participant_asset_not_ready_for_export');
            (err as any).code = 'participant_asset_not_ready';
            throw err;
        }
        sourceStorageKey = participantAsset.storage_key;
        resolvedParticipantAssetId = participantAsset.id;
    } else {
        const combinedAsset = artifact.combined_asset_id
            ? await prisma.combined_asset.findUnique({
                where: { id: artifact.combined_asset_id },
                select: { id: true, state: true, storage_key: true },
            })
            : await prisma.combined_asset.findUnique({
                where: { recording_id: artifact.recording_id },
                select: { id: true, state: true, storage_key: true },
            });

        if (
            (artifact.type === export_type.mp4 || artifact.type === export_type.mp4_captions) &&
            combinedAsset?.state === 'ready' &&
            combinedAsset.storage_key
        ) {
            sourceStorageKey = combinedAsset.storage_key;
            resolvedCombinedAssetId = combinedAsset.id;
        }
    }

    if (!sourceStorageKey) {
        if (artifact.type === export_type.mp4_captions) {
            const err = new Error('captions_source_asset_not_ready');
            (err as any).code = 'captions_source_not_ready';
            throw err;
        }

        // Fallback for non-caption exports: first processed track with final key.
        const tracks = await prisma.track.findMany({
            where: {
                recording_id: artifact.recording_id,
                state: track_state.processed,
                storage_key_final: { not: null },
            },
            orderBy: { created_at: 'asc' },
        });

        if (!tracks.length) {
            const err = new Error('no_processed_tracks_for_export');
            (err as any).code = 'no_tracks';
            throw err;
        }

        const fallbackTrack =
            artifact.type === export_type.wav
                ? tracks.find((t) => t.kind === track_kind.audio) ?? tracks[0]
                : tracks.find((t) => t.kind === track_kind.video) ?? tracks[0];

        sourceStorageKey = fallbackTrack.storage_key_final;
        if (!sourceStorageKey) {
            const err = new Error('source_track_missing_final_key');
            (err as any).code = 'no_final_key';
            throw err;
        }
    }

    let finalKey: string;
    let transcriptId: string | null = artifact.transcript_id ?? null;

    // Decide how to build the export based on type
    if (artifact.type === export_type.mp4_captions) {
        const result = await renderCaptionsExportForRecording({
            recordingId: artifact.recording_id,
            exportType: artifact.type,
            sourceStorageKey,
            sourceAsset: {
                combinedAssetId: resolvedCombinedAssetId ?? undefined,
                participantAssetId: resolvedParticipantAssetId ?? undefined,
            },
        });
        finalKey = result.finalKey;
        transcriptId = result.transcriptId;
    } else {
        const result = await renderStandardExportForRecording({
            recordingId: artifact.recording_id,
            exportType: artifact.type,
            sourceStorageKey,
        });
        finalKey = result.finalKey;
    }

    // Persist export artifact result
    const finalized = await prisma.export_artifact.update({
        where: { id: artifact.id },
        data: {
            storage_key: finalKey,
            state: export_state.succeeded,
            last_error: null,
            combined_asset_id: resolvedCombinedAssetId,
            participant_asset_id: resolvedParticipantAssetId,
            transcript_id: transcriptId,
            ready_at: new Date(),
            failed_at: null,
            failure_reason: null,
        },
    });
    emitTelemetry({
        event: 'export.ready',
        message: 'Export artifact marked ready',
        recordingId: artifact.recording_id,
        assetId: finalized.id,
        storageKey: finalized.storage_key ?? undefined,
        exportType: finalized.type,
        transcriptId: finalized.transcript_id ?? undefined,
        combinedAssetId: finalized.combined_asset_id ?? undefined,
        participantAssetId: finalized.participant_asset_id ?? undefined,
        jobId: job.id,
    });

    await reconcileRecordingReadiness(artifact.recording_id);
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
    const message =
        (err?.code ? `${err.code}: ` : '') + (err?.message || String(err));

    await prisma.$transaction(async (tx) => {
        await tx.job.update({
            where: { id: job.id },
            data: {
                state: attemptsLeft ? job_state.queued : job_state.failed,
                last_error: message.slice(0, 8000),
            },
        });

        if (err?.code !== 'bad_payload' && err?.code !== 'not_found') {
            const exportId = job.payload_json?.exportId as string | undefined;
            if (exportId) {
                await tx.export_artifact.updateMany({
                    where: { id: exportId },
                    data: {
                        state: export_state.failed,
                        last_error: message.slice(0, 8000),
                        failed_at: new Date(),
                        failure_reason: message.slice(0, 1000),
                    },
                });
            }
        }
    });

    const exportId = job.payload_json?.exportId as string | undefined;
    emitTelemetry({
        level: 'error',
        event: 'export.failed',
        message: 'Export job failed',
        recordingId: job.recording_id,
        jobId: job.id,
        assetId: exportId,
        reason: message.slice(0, 1000),
        err,
    });

    await reconcileRecordingReadiness(job.recording_id);
}

export async function runExportWorker() {
    emitTelemetry({
        event: 'worker.started',
        message: `[${WORKER_NAME}] starting`,
        worker: WORKER_NAME,
    });

    while (!stopping) {
        try {
            const job = await claimOneExportJob();
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

// Allow `node dist/workers/export.worker.js` to run the loop (ESM style)
const isMain =
    process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
    runExportWorker().catch((e) => {
        emitTelemetry({
            level: 'error',
            event: 'worker.fatal',
            message: '[export-worker] fatal',
            worker: WORKER_NAME,
            err: e,
        });
        process.exit(1);
    });
}
