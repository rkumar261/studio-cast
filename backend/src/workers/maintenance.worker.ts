import { pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import { job_state, job_type, track_chunk_state } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { validateTusStorageContractFromEnv } from '../lib/tus-storage-contract.js';
import { reconcileRecordingReadiness } from '../services/recording-readiness.service.js';

const WORKER_NAME = 'maintenance-worker';
const POLL_MS = Number(process.env.MAINTENANCE_POLL_MS ?? 60_000);
const STALE_CHUNK_MS = Number(process.env.MAINTENANCE_STALE_CHUNK_MS ?? 30 * 60 * 1000);
const STALE_UPLOAD_MS = Number(process.env.MAINTENANCE_STALE_UPLOAD_MS ?? 30 * 60 * 1000);
const STALE_RUNNING_JOB_MS = Number(process.env.MAINTENANCE_STALE_RUNNING_JOB_MS ?? 20 * 60 * 1000);
const STALE_TUS_ORPHAN_MS = Number(process.env.MAINTENANCE_STALE_TUS_ORPHAN_MS ?? STALE_CHUNK_MS);
const RUN_ONCE = process.env.MAINTENANCE_RUN_ONCE === '1';

let stopping = false;
process.on('SIGINT', () => (stopping = true));
process.on('SIGTERM', () => (stopping = true));

async function exists(filePath: string) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

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

async function cleanupOrphanTusTempFiles(args: { tusUploadDir: string; cutoff: Date }) {
  const refs = await prisma.track_chunk.findMany({
    where: { tus_upload_id: { not: null } },
    select: {
      tus_upload_id: true,
      state: true,
      updated_at: true,
    },
  });

  const refByTusId = new Map<string, { states: Set<track_chunk_state>; latest: Date }>();
  for (const ref of refs) {
    const tusId = ref.tus_upload_id ?? '';
    if (!tusId) continue;
    const existing = refByTusId.get(tusId);
    if (!existing) {
      refByTusId.set(tusId, { states: new Set([ref.state]), latest: ref.updated_at });
      continue;
    }
    existing.states.add(ref.state);
    if (ref.updated_at > existing.latest) existing.latest = ref.updated_at;
  }

  const entries = await fs.readdir(args.tusUploadDir, { withFileTypes: true });
  let deleted = 0;
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.endsWith('.info')) continue;
    const tusId = entry.name;
    const dataPath = path.join(args.tusUploadDir, tusId);
    const infoPath = path.join(args.tusUploadDir, `${tusId}.info`);
    const stat = await fs.stat(dataPath).catch(() => null);
    if (!stat || stat.mtime >= args.cutoff) continue;

    const ref = refByTusId.get(tusId);
    const shouldDelete =
      !ref ||
      ref.states.has(track_chunk_state.failed) ||
      (ref.states.has(track_chunk_state.uploaded) &&
        !ref.states.has(track_chunk_state.initiated) &&
        !ref.states.has(track_chunk_state.uploading));
    if (!shouldDelete) continue;

    await fs.unlink(dataPath).catch(() => {});
    await fs.unlink(infoPath).catch(() => {});
    deleted += 1;
  }

  return deleted;
}

async function cleanupOrphanTusChunks(args: { tusUploadDir: string; cutoff: Date }) {
  const candidates = await prisma.track_chunk.findMany({
    where: {
      protocol: 'tus',
      state: { in: [track_chunk_state.initiated, track_chunk_state.uploading] },
      updated_at: { lt: args.cutoff },
      tus_upload_id: { not: null },
    },
    select: {
      id: true,
      tus_upload_id: true,
    },
  });

  let markedFailed = 0;
  for (const candidate of candidates) {
    const tusId = candidate.tus_upload_id ?? '';
    if (!tusId) continue;
    const dataPath = path.join(args.tusUploadDir, tusId);
    const infoPath = path.join(args.tusUploadDir, `${tusId}.info`);
    const hasData = await exists(dataPath);
    const hasInfo = await exists(infoPath);
    if (hasData || hasInfo) continue;

    await prisma.track_chunk.update({
      where: { id: candidate.id },
      data: {
        state: track_chunk_state.failed,
        failure_reason: 'maintenance_orphan_tus_upload',
        last_error_at: new Date(),
        tus_upload_state: 'orphaned',
      },
    });
    markedFailed += 1;
  }

  return markedFailed;
}

async function runMaintenanceCycle() {
  const now = Date.now();
  const staleChunkCutoff = new Date(now - STALE_CHUNK_MS);
  const staleUploadCutoff = new Date(now - STALE_UPLOAD_MS);
  const staleRunningJobCutoff = new Date(now - STALE_RUNNING_JOB_MS);
  const staleTusOrphanCutoff = new Date(now - STALE_TUS_ORPHAN_MS);

  let orphanTusTempFilesDeleted = 0;
  let orphanTusChunksMarkedFailed = 0;
  const tusStorageValidation = await validateTusStorageContractFromEnv();
  if (!tusStorageValidation.ok) {
    console.warn(`[${WORKER_NAME}] skipping orphan TUS cleanup (invalid storage contract)`, {
      code: tusStorageValidation.code,
      details: tusStorageValidation.details,
    });
  } else {
    orphanTusChunksMarkedFailed = await cleanupOrphanTusChunks({
      tusUploadDir: tusStorageValidation.contract.tusUploadDir,
      cutoff: staleTusOrphanCutoff,
    });
    orphanTusTempFilesDeleted = await cleanupOrphanTusTempFiles({
      tusUploadDir: tusStorageValidation.contract.tusUploadDir,
      cutoff: staleTusOrphanCutoff,
    });
  }

  const staleChunksMarkedFailed = await cleanupStaleChunks(staleChunkCutoff);
  const staleUploadsMarkedFailed = await cleanupStaleUploads(staleUploadCutoff);
  const staleRunningResult = await cleanupStaleRunningJobs(staleRunningJobCutoff);

  for (const recordingId of staleRunningResult.touchedRecordingIds) {
    await reconcileRecordingReadiness(recordingId);
  }

  const jobCounts = await collectJobCounts();
  console.info(`[${WORKER_NAME}] cycle`, {
    orphanTusChunksMarkedFailed,
    orphanTusTempFilesDeleted,
    staleChunksMarkedFailed,
    staleUploadsMarkedFailed,
    staleRunningJobsMarkedFailed: staleRunningResult.staleJobCount,
    staleExportsMarkedFailed: staleRunningResult.staleExportCount,
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
