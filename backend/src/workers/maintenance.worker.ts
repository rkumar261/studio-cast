import { pathToFileURL } from 'node:url';
import { job_state, job_type, track_chunk_state } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { reconcileRecordingReadiness } from '../services/recording-readiness.service.js';

const WORKER_NAME = 'maintenance-worker';
const POLL_MS = Number(process.env.MAINTENANCE_POLL_MS ?? 60_000);
const STALE_CHUNK_MS = Number(process.env.MAINTENANCE_STALE_CHUNK_MS ?? 30 * 60 * 1000);
const STALE_UPLOAD_MS = Number(process.env.MAINTENANCE_STALE_UPLOAD_MS ?? 30 * 60 * 1000);
const STALE_RUNNING_JOB_MS = Number(process.env.MAINTENANCE_STALE_RUNNING_JOB_MS ?? 20 * 60 * 1000);
const RUN_ONCE = process.env.MAINTENANCE_RUN_ONCE === '1';

let stopping = false;
process.on('SIGINT', () => (stopping = true));
process.on('SIGTERM', () => (stopping = true));

async function collectJobCounts() {
  const counts: Record<string, number> = {};
  const states = [
    job_state.queued,
    job_state.running,
    job_state.succeeded,
    job_state.failed,
    job_state.dead,
  ];

  const types = [job_type.stitch, job_type.transcode, job_type.asr, job_type.export];

  for (const type of types) {
    for (const state of states) {
      const key = `${type}.${state}`;
      counts[key] = await prisma.job.count({
        where: {
          type,
          state,
        },
      });
    }
  }

  return counts;
}

async function cleanupStaleChunks(cutoff: Date) {
  const now = new Date();
  const result = await prisma.track_chunk.updateMany({
    where: {
      state: {
        in: [track_chunk_state.initiated, track_chunk_state.uploading],
      },
      updated_at: { lt: cutoff },
    },
    data: {
      state: track_chunk_state.failed,
      failure_reason: 'maintenance_stale_chunk_timeout',
      last_error_at: now,
      tus_upload_state: 'failed',
    },
  });

  return result.count;
}

async function cleanupStaleUploads(cutoff: Date) {
  const result = await prisma.upload.updateMany({
    where: {
      state: 'in_progress',
      updated_at: { lt: cutoff },
    },
    data: {
      state: 'failed',
    },
  });

  return result.count;
}

/**
 * Find recordings that have a pending combined_asset but no active jobs running.
 * This handles cases where recordings get stuck — e.g. after a combined_asset is
 * reset to 'pending' (manual SQL or fingerprint invalidation) but no transcode/ASR
 * job completion fires to retrigger reconcileRecordingReadiness.
 */
export async function sweepPendingCombinedAssets(): Promise<string[]> {
  const pendingCombined = await prisma.combined_asset.findMany({
    where: { state: 'pending' },
    select: { recording_id: true },
  });

  if (pendingCombined.length === 0) return [];

  const recordingIds = Array.from(new Set(pendingCombined.map((r) => r.recording_id)));

  // Filter out recordings that already have active jobs — they will reconcile on completion.
  const activeJobs = await prisma.job.findMany({
    where: {
      recording_id: { in: recordingIds },
      state: { in: [job_state.queued, job_state.running] },
    },
    select: { recording_id: true },
  });

  const activeRecordingIds = new Set(activeJobs.map((j) => j.recording_id));
  return recordingIds.filter((id) => !activeRecordingIds.has(id));
}

async function cleanupStaleRunningJobs(cutoff: Date) {
  const staleRunning = await prisma.job.findMany({
    where: {
      state: job_state.running,
      created_at: { lt: cutoff },
    },
    select: {
      id: true,
      recording_id: true,
      type: true,
      payload_json: true,
    },
  });

  if (staleRunning.length === 0) {
    return { staleJobCount: 0, staleExportCount: 0, touchedRecordingIds: [] as string[] };
  }

  await prisma.job.updateMany({
    where: {
      id: { in: staleRunning.map((job) => job.id) },
    },
    data: {
      state: job_state.failed,
      last_error: 'maintenance_timeout_running_job',
    },
  });

  const staleExportIds = staleRunning
    .filter((job) => job.type === job_type.export)
    .map((job) => {
      const payload = job.payload_json;
      if (!payload || typeof payload !== 'object') return null;
      return (payload as { exportId?: unknown }).exportId;
    })
    .filter((exportId): exportId is string => typeof exportId === 'string');

  let staleExportCount = 0;
  if (staleExportIds.length > 0) {
    const exportResult = await prisma.export_artifact.updateMany({
      where: {
        id: { in: staleExportIds },
      },
      data: {
        state: 'failed',
        last_error: 'maintenance_timeout_running_job',
      },
    });
    staleExportCount = exportResult.count;
  }

  const touchedRecordingIds = Array.from(new Set(staleRunning.map((job) => job.recording_id)));

  return {
    staleJobCount: staleRunning.length,
    staleExportCount,
    touchedRecordingIds,
  };
}

async function runMaintenanceCycle() {
  const now = Date.now();
  const staleChunkCutoff = new Date(now - STALE_CHUNK_MS);
  const staleUploadCutoff = new Date(now - STALE_UPLOAD_MS);
  const staleRunningJobCutoff = new Date(now - STALE_RUNNING_JOB_MS);

  const staleChunksMarkedFailed = await cleanupStaleChunks(staleChunkCutoff);
  const staleUploadsMarkedFailed = await cleanupStaleUploads(staleUploadCutoff);
  const staleRunningResult = await cleanupStaleRunningJobs(staleRunningJobCutoff);

  for (const recordingId of staleRunningResult.touchedRecordingIds) {
    await reconcileRecordingReadiness(recordingId);
  }

  // Sweep: retrigger readiness for recordings with a pending combined_asset but no
  // active jobs. This unblocks recordings that were reset manually or whose combined
  // asset fingerprint became stale with no new job to kick off reconciliation.
  const pendingCombinedIds = await sweepPendingCombinedAssets();
  for (const recordingId of pendingCombinedIds) {
    await reconcileRecordingReadiness(recordingId);
  }

  const jobCounts = await collectJobCounts();
  console.info(`[${WORKER_NAME}] cycle`, {
    staleChunksMarkedFailed,
    staleUploadsMarkedFailed,
    staleRunningJobsMarkedFailed: staleRunningResult.staleJobCount,
    staleExportsMarkedFailed: staleRunningResult.staleExportCount,
    pendingCombinedRequeued: pendingCombinedIds.length,
    jobCounts,
  });
}

export async function runMaintenanceWorker() {
  console.log(`[${WORKER_NAME}] starting...`);

  while (!stopping) {
    try {
      await runMaintenanceCycle();
    } catch (err) {
      console.error(`[${WORKER_NAME}] cycle failed`, err);
    }

    if (RUN_ONCE || stopping) break;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }

  console.log(`[${WORKER_NAME}] stopping.`);
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  runMaintenanceWorker().catch((e) => {
    console.error('[maintenance-worker] fatal', e);
    process.exit(1);
  });
}
