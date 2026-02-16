import { pathToFileURL } from 'node:url';
import { job_state, job_type, track_state } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { enqueueTranscodeJob } from '../repositories/job.repo.js';
import { maybeMarkRecordingProcessing } from '../services/recording-pipeline.service.js';
import { runStitchForTrack } from './stitch.runner.js';

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

const WORKER_NAME = 'stitch-worker';
const MAX_ATTEMPTS = 3;
const POLL_MS = 1500;

let stopping = false;
process.on('SIGINT', () => (stopping = true));
process.on('SIGTERM', () => (stopping = true));

async function claimOneStitchJob(): Promise<JobRow | null> {
  return prisma.$transaction(async (tx) => {
    const job = await tx.job.findFirst({
      where: { type: job_type.stitch, state: job_state.queued },
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

  const track = await prisma.track.findUnique({
    where: { id: payload.trackId },
    select: {
      id: true,
      recording_id: true,
      state: true,
      storage_key_raw: true,
    },
  });

  if (!track) {
    const err = new Error('track_not_found');
    (err as any).code = 'not_found';
    throw err;
  }

  // Idempotency: if stitched raw already exists, skip stitch and move forward.
  if (track.storage_key_raw) {
    await enqueueTranscodeJob(track.recording_id, track.id);
    await maybeMarkRecordingProcessing(track.recording_id);
    return;
  }

  const chunks = await prisma.track_chunk.findMany({
    where: { track_id: track.id },
    orderBy: { seq: 'asc' },
    select: {
      seq: true,
      state: true,
      storage_key_raw: true,
    },
  });

  if (!chunks.length) {
    const err = new Error('stitch_no_chunks');
    (err as any).code = 'no_chunks';
    throw err;
  }

  const incomplete = chunks.find((chunk) => chunk.state !== 'uploaded' || !chunk.storage_key_raw);
  if (incomplete) {
    const err = new Error(`stitch_chunks_not_uploaded seq=${incomplete.seq}`);
    (err as any).code = 'chunks_not_finalized';
    throw err;
  }

  const outcome = await runStitchForTrack({
    recordingId: track.recording_id,
    trackId: track.id,
    chunks: chunks.map((chunk) => ({
      seq: chunk.seq,
      storageKeyRaw: chunk.storage_key_raw as string,
    })),
  });

  await prisma.track.update({
    where: { id: track.id },
    data: {
      state: track_state.uploaded,
      storage_key_raw: outcome.rawKey,
    },
  });

  await enqueueTranscodeJob(track.recording_id, track.id);
  await maybeMarkRecordingProcessing(track.recording_id);
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

export async function runStitchWorker() {
  console.log(`[${WORKER_NAME}] starting...`);

  while (!stopping) {
    try {
      const job = await claimOneStitchJob();
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
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }

  console.log(`[${WORKER_NAME}] stopping.`);
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  runStitchWorker().catch((e) => {
    console.error('[stitch-worker] fatal', e);
    process.exit(1);
  });
}
