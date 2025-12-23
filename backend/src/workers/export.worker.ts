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
const POLL_MS = 1500;

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
    artifact = await prisma.export_artifact.update({
        where: { id: artifact.id },
        data: {
            state: export_state.running,
            last_error: null,
        },
    });

    // Pick a source track for this export
    const tracks = await prisma.track.findMany({
        where: {
            recording_id: artifact.recording_id,
            state: track_state.processed,              // use enum
            storage_key_final: { not: null },          // ensure we only pick tracks with a final key
        },
        orderBy: { created_at: 'asc' },
    });

    if (!tracks.length) {
        const err = new Error('no_processed_tracks_for_export');
        (err as any).code = 'no_tracks';
        throw err;
    }

    let sourceTrack =
        artifact.type === export_type.wav
            ? tracks.find((t) => t.kind === track_kind.audio) ?? tracks[0]
            : tracks.find((t) => t.kind === track_kind.video) ?? tracks[0];

    if (!sourceTrack.storage_key_final) {
        const err = new Error('source_track_missing_final_key');
        (err as any).code = 'no_final_key';
        throw err;
    }

    let finalKey: string;

    // Decide how to build the export based on type
    if (artifact.type === export_type.mp4_captions) {
        // For captions exports, go through the captions service
        const result = await renderCaptionsExportForRecording({
            recordingId: artifact.recording_id,
            exportType: artifact.type,
            sourceStorageKey: sourceTrack.storage_key_final,
        });
        finalKey = result.finalKey;
    } else {
        // For wav/mp4 (for now), just reuse the processed track key
        finalKey = sourceTrack.storage_key_final;
    }

    // Persist export artifact result
    await prisma.export_artifact.update({
        where: { id: artifact.id },
        data: {
            storage_key: finalKey,
            state: export_state.succeeded,
            last_error: null,
        },
    });

    // (Optionally, we might also update recording.status here later.)
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
                    },
                });
            }
        }
    });
}

export async function runExportWorker() {
    console.log(`[${WORKER_NAME}] starting…`);

    while (!stopping) {
        try {
            const job = await claimOneExportJob();
            if (job) {
                try {
                    console.log(`[${WORKER_NAME}] running job ${job.id}`);
                    await runJob(job);
                    await succeed(job.id);
                    console.log(`[${WORKER_NAME}] job ${job.id} succeeded`);
                } catch (err) {
                    console.error(`[${WORKER_NAME}] job ${job.id} failed`, err);
                    await fail(job, err);
                }
            }
        } catch (loopErr) {
            console.error(`[${WORKER_NAME}] loop error`, loopErr);
        }

        if (stopping) break;
        await new Promise((r) => setTimeout(r, POLL_MS));
    }

    console.log(`[${WORKER_NAME}] stopping.`);
}

// Allow `node dist/workers/export.worker.js` to run the loop (ESM style)
const isMain =
    process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
    runExportWorker().catch((e) => {
        console.error('[export-worker] fatal', e);
        process.exit(1);
    });
}
