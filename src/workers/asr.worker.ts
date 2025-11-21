import { prisma } from '../lib/prisma.js';
import { job_state, job_type } from '@prisma/client';
import { pathToFileURL } from 'node:url';
import { runAsrForTrack } from '../services/asr.service.js';

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
const POLL_MS = 1500;

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
            storage_key_final: true,
            duration_ms: true,
        },
    });

    if (!track || !track.storage_key_final) {
        const err = new Error('track_not_found_or_no_final');
        (err as any).code = 'not_found';
        throw err;
    }

    // Run ASR via service (currently dummy; later real ASR)
    const { segments } = await runAsrForTrack({
        storageKeyFinal: track.storage_key_final,
        durationMs: track.duration_ms,
    });

    // Idempotency: clear old segments for this recording+track
    await prisma.transcript_segment.deleteMany({
        where: { recording_id: track.recording_id, track_id: track.id },
    });

    // Insert new segments
    await prisma.transcript_segment.createMany({
        data: segments.map((seg) => ({
            recording_id: track.recording_id,
            track_id: track.id,
            start_ms: seg.startMs,
            end_ms: seg.endMs,
            text: seg.text,
            speaker: seg.speaker ?? null,
            confidence: seg.confidence ?? null,
        })),
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
            state: attemptsLeft ? job_state.queued : job_state.failed,
            last_error: message.slice(0, 8000),
        },
    });
}

export async function runAsrWorker() {
    console.log(`[${WORKER_NAME}] starting…`);

    while (!stopping) {
        try {
            const job = await claimOneAsrJob();
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

// Allow `node dist/workers/asr.worker.js` to run the loop (ESM-style)
const isMain =
    process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
    runAsrWorker().catch((e) => {
        console.error('[asr-worker] fatal', e);
        process.exit(1);
    });
}
