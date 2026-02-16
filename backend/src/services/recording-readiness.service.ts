import { export_state, export_type, job_state, recording_status, track_state } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { createJob } from '../repositories/job.repo.js';

export const REQUIRED_EXPORT_TYPES = [
  export_type.wav,
  export_type.mp4,
  export_type.mp4_captions,
] as const;

function hasExportId(payload: unknown, exportId: string): boolean {
  if (!payload || typeof payload !== 'object') return false;
  return (payload as { exportId?: unknown }).exportId === exportId;
}

async function ensureExportJobForArtifact(args: {
  recordingId: string;
  exportId: string;
  type: export_type;
}) {
  const activeJobs = await prisma.job.findMany({
    where: {
      recording_id: args.recordingId,
      type: 'export',
      state: { in: [job_state.queued, job_state.running] },
    },
    orderBy: { created_at: 'desc' },
    take: 100,
  });

  const hasActiveJob = activeJobs.some((job) => hasExportId(job.payload_json, args.exportId));
  if (hasActiveJob) return { queued: false };

  await createJob(args.recordingId, 'export', {
    exportId: args.exportId,
    type: args.type,
  });

  return { queued: true };
}

function pickCanonicalRequiredExport(
  rows: Array<{
    id: string;
    type: export_type;
    state: export_state;
    updated_at: Date;
    created_at: Date;
  }>,
  type: export_type
) {
  return rows
    .filter((row) => row.type === type)
    .sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime())[0];
}

async function upsertRequiredExportArtifacts(recordingId: string) {
  const rows = await prisma.export_artifact.findMany({
    where: {
      recording_id: recordingId,
      type: { in: [...REQUIRED_EXPORT_TYPES] },
    },
    orderBy: { created_at: 'asc' },
  });

  const ensured: Array<{
    id: string;
    type: export_type;
    state: export_state;
    updated_at: Date;
    created_at: Date;
  }> = [...rows];

  for (const requiredType of REQUIRED_EXPORT_TYPES) {
    const canonical = pickCanonicalRequiredExport(ensured, requiredType);
    if (canonical) continue;

    const created = await prisma.export_artifact.create({
      data: {
        recording_id: recordingId,
        type: requiredType,
        state: export_state.queued,
      },
      select: {
        id: true,
        type: true,
        state: true,
        updated_at: true,
        created_at: true,
      },
    });

    ensured.push(created);
  }

  return REQUIRED_EXPORT_TYPES.map((type) => pickCanonicalRequiredExport(ensured, type)).filter(Boolean) as Array<{
    id: string;
    type: export_type;
    state: export_state;
    updated_at: Date;
    created_at: Date;
  }>;
}

export async function reconcileRecordingReadiness(recordingId: string) {
  const recording = await prisma.recording.findUnique({
    where: { id: recordingId },
    select: {
      id: true,
      status: true,
      stopped_at: true,
      track: {
        select: {
          id: true,
          state: true,
          storage_key_final: true,
        },
      },
      transcript_segment: {
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!recording) return { code: 'not_found' as const };
  if (!recording.stopped_at) {
    return { code: 'skipped' as const, reason: 'recording_not_stopped' as const };
  }

  const tracks = recording.track;
  if (tracks.length === 0) {
    return { code: 'skipped' as const, reason: 'no_tracks' as const };
  }

  const allTracksProcessed = tracks.every(
    (track) => track.state === track_state.processed && !!track.storage_key_final
  );

  if (!allTracksProcessed) {
    return { code: 'skipped' as const, reason: 'tracks_not_processed' as const };
  }

  const hasTranscript = recording.transcript_segment.length > 0;
  if (!hasTranscript) {
    return { code: 'skipped' as const, reason: 'transcript_not_ready' as const };
  }

  const requiredExports = await upsertRequiredExportArtifacts(recordingId);

  for (const artifact of requiredExports) {
    if (artifact.state === export_state.queued) {
      await ensureExportJobForArtifact({
        recordingId,
        exportId: artifact.id,
        type: artifact.type,
      });
    }
  }

  const refreshed = await prisma.export_artifact.findMany({
    where: {
      recording_id: recordingId,
      type: { in: [...REQUIRED_EXPORT_TYPES] },
    },
    orderBy: { created_at: 'asc' },
    select: {
      id: true,
      type: true,
      state: true,
      updated_at: true,
      created_at: true,
    },
  });

  const canonical = REQUIRED_EXPORT_TYPES.map((type) => pickCanonicalRequiredExport(refreshed, type)).filter(Boolean) as Array<{
    id: string;
    type: export_type;
    state: export_state;
    updated_at: Date;
    created_at: Date;
  }>;

  const hasMissing = canonical.length !== REQUIRED_EXPORT_TYPES.length;
  const hasFailed = canonical.some((row) => row.state === export_state.failed);
  const allSucceeded = !hasMissing && canonical.every((row) => row.state === export_state.succeeded);

  if (hasFailed) {
    if (recording.status !== recording_status.error) {
      await prisma.recording.update({
        where: { id: recordingId },
        data: { status: recording_status.error },
      });
    }

    return { code: 'ok' as const, status: recording_status.error };
  }

  if (allSucceeded) {
    if (recording.status !== recording_status.ready) {
      await prisma.recording.update({
        where: { id: recordingId },
        data: { status: recording_status.ready },
      });
    }

    return { code: 'ok' as const, status: recording_status.ready };
  }

  if (recording.status !== recording_status.processing) {
    await prisma.recording.update({
      where: { id: recordingId },
      data: { status: recording_status.processing },
    });
  }

  return { code: 'ok' as const, status: recording_status.processing };
}
