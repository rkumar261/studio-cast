import { pathToFileURL } from 'node:url';
import { job_state, job_type, track_state } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { enqueueTranscodeJob } from '../repositories/job.repo.js';
import { maybeMarkRecordingProcessing } from '../services/recording-pipeline.service.js';
import { evaluateTrackStitchReadiness } from '../services/track-contiguity.service.js';
import { runStitchForTrack } from './stitch.runner.js';
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

const WORKER_NAME = 'stitch-worker';
const MAX_ATTEMPTS = 3;
const POLL_MS = 1500;

let stopping = false;
process.on('SIGINT', () => (stopping = true));
process.on('SIGTERM', () => (stopping = true));

function isMissingStitchEnumError(err: unknown): boolean {
  const message = String((err as any)?.message ?? err ?? '');
  return (
    message.includes('invalid input value for enum job_type') &&
    message.includes('"stitch"')
  );
}

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
      final_seq: true,
      capture_closed_at: true,
      track_chunk: {
        orderBy: { seq: 'asc' },
        select: {
          seq: true,
          state: true,
          storage_key_raw: true,
        },
      },
    },
  });

  if (!track) {
    const err = new Error('track_not_found');
    (err as any).code = 'not_found';
    throw err;
  }

  emitTelemetry({
    event: 'stitch.started',
    message: 'Stitch execution started',
    recordingId: track.recording_id,
    trackId: track.id,
    jobId: job.id,
  });

  // Idempotency: if stitched raw already exists, skip stitch and move forward.
  if (track.storage_key_raw) {
    await enqueueTranscodeJob(track.recording_id, track.id);
    await maybeMarkRecordingProcessing(track.recording_id);
    emitTelemetry({
      event: 'stitch.finished',
      message: 'Stitch skipped because stitched artifact already exists',
      recordingId: track.recording_id,
      trackId: track.id,
      jobId: job.id,
      alreadyStitched: true,
      storageKeyRaw: track.storage_key_raw,
    });
    return;
  }

  const readiness = evaluateTrackStitchReadiness({
    storageKeyRaw: track.storage_key_raw,
    finalSeq: track.final_seq,
    captureClosedAt: track.capture_closed_at,
    chunks: track.track_chunk,
  });
  if (!readiness.ready) {
    if (readiness.reason === 'missing_chunks') {
      const err = new Error(`stitch_missing_chunks seqs=${readiness.missingSeqs.join(',')}`);
      (err as any).code = 'missing_chunks';
      throw err;
    }
    if (readiness.reason === 'chunks_not_uploaded') {
      const firstIncomplete = readiness.incompleteSeqs[0];
      const err = new Error(`stitch_chunks_not_uploaded seq=${firstIncomplete ?? 'unknown'}`);
      (err as any).code = 'chunks_not_finalized';
      throw err;
    }
    const err = new Error(`stitch_track_not_ready reason=${readiness.reason}`);
    (err as any).code = 'track_not_ready';
    throw err;
  }

  const outcome = await runStitchForTrack({
    recordingId: track.recording_id,
    trackId: track.id,
    chunks: track.track_chunk.map((chunk) => ({
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

  emitTelemetry({
    event: 'stitch.finished',
    message: 'Stitch execution finished',
    recordingId: track.recording_id,
    trackId: track.id,
    jobId: job.id,
    outputStorageKey: outcome.rawKey,
    chunkCount: track.track_chunk.length,
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
  emitTelemetry({
    event: 'worker.started',
    message: `[${WORKER_NAME}] starting`,
    worker: WORKER_NAME,
  });

  while (!stopping) {
    try {
      const job = await claimOneStitchJob();
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
            event: 'stitch.failed',
            message: 'Stitch execution failed',
            worker: WORKER_NAME,
            recordingId: job.recording_id,
            jobId: job.id,
            trackId: (job.payload_json ?? {})?.trackId,
            err,
          });
          await fail(job, err);
        }
      }
    } catch (loopErr) {
      if (isMissingStitchEnumError(loopErr)) {
        emitTelemetry({
          level: 'error',
          event: 'worker.loop.error',
          message:
            `[${WORKER_NAME}] database is missing enum value job_type.stitch. ` +
            'Apply prisma migration 20260216201500_add_stitch_job_type and restart worker.',
          worker: WORKER_NAME,
          err: loopErr,
        });
        break;
      }
      emitTelemetry({
        level: 'error',
        event: 'worker.loop.error',
        message: `[${WORKER_NAME}] loop error`,
        worker: WORKER_NAME,
        err: loopErr,
      });
    }

    if (stopping) break;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }

  emitTelemetry({
    event: 'worker.stopped',
    message: `[${WORKER_NAME}] stopping`,
    worker: WORKER_NAME,
  });
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  runStitchWorker().catch((e) => {
    emitTelemetry({
      level: 'error',
      event: 'worker.fatal',
      message: '[stitch-worker] fatal',
      worker: WORKER_NAME,
      err: e,
    });
    process.exit(1);
  });
}
