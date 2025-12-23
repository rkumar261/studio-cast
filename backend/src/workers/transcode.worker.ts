import { prisma } from '../lib/prisma.js';
import { runTranscodeForTrack } from './transcode.runner.js';
import { job_state, job_type, track_state, track_kind } from '@prisma/client';
import { pathToFileURL } from 'node:url';

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
const POLL_MS = 1500;

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
            kind: true,
            storage_key_raw: true,
            storage_key_final: true,
            state: true,
        },
    });

    if (!track || !track.storage_key_raw) {
        const err = new Error('track_not_found_or_no_raw');
        (err as any).code = 'not_found';
        throw err;
    }

    // Do the actual transcode (ffmpeg + upload final to R2)
    const out = await runTranscodeForTrack({
        id: track.id,
        recording_id: track.recording_id,
        storage_key_raw: track.storage_key_raw,
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

    // Persist final key + mark processed
    await prisma.track.update({
        where: { id: track.id },
        data: {
            storage_key_final: out.finalKey,
            state: track_state.processed,
            codec: codec ?? undefined,
            duration_ms: duration_ms ?? undefined,
        },
    });

    // Enqueue follow-up ASR job (your schema requires recording_id)
    await prisma.job.create({
        data: {
            recording_id: track.recording_id,
            type: job_type.asr,
            state: job_state.queued,
            payload_json: { trackId: track.id },
        },
    });
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
    console.log(`[${WORKER_NAME}] starting…`);

    while (!stopping) {
        try {
            const job = await claimOneTranscodeJob();
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
    console.error('[transcode-worker] fatal', e);
    process.exit(1);
  });
}