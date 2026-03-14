import { export_state, export_type, job_state, recording_status } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { createJob } from '../repositories/job.repo.js';
import { reconcileCombinedAssetForRecording } from './combined-asset.service.js';
import { listParticipantMasterStatesForRecording } from './participant-asset.service.js';

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
    combined_asset_id?: string | null;
  }>,
  type: export_type
) {
  return rows
    .filter((row) => row.type === type)
    .sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime())[0];
}

async function upsertRequiredExportArtifacts(args: {
  recordingId: string;
  combinedAssetId: string;
}) {
  const { recordingId, combinedAssetId } = args;
  const rows = await prisma.export_artifact.findMany({
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
      combined_asset_id: true,
    },
  });

  const ensured: Array<{
    id: string;
    type: export_type;
    state: export_state;
    updated_at: Date;
    created_at: Date;
    combined_asset_id: string | null;
  }> = [...rows];

  for (const requiredType of REQUIRED_EXPORT_TYPES) {
    const canonical = pickCanonicalRequiredExport(ensured, requiredType);
    const shouldLinkCombined =
      requiredType === export_type.mp4 || requiredType === export_type.mp4_captions;

    if (canonical) {
      if (
        shouldLinkCombined &&
        canonical.combined_asset_id !== combinedAssetId
      ) {
        const updated = await prisma.export_artifact.update({
          where: { id: canonical.id },
          data: {
            combined_asset_id: combinedAssetId,
          },
          select: {
            id: true,
            type: true,
            state: true,
            updated_at: true,
            created_at: true,
            combined_asset_id: true,
          },
        });
        const idx = ensured.findIndex((row) => row.id === canonical.id);
        if (idx >= 0) ensured[idx] = updated;
      }
      continue;
    }

    const created = await prisma.export_artifact.create({
      data: {
        recording_id: recordingId,
        type: requiredType,
        state: export_state.queued,
        combined_asset_id: shouldLinkCombined ? combinedAssetId : null,
      },
      select: {
        id: true,
        type: true,
        state: true,
        updated_at: true,
        created_at: true,
        combined_asset_id: true,
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
    combined_asset_id: string | null;
  }>;
}

export async function reconcileRecordingReadiness(recordingId: string) {
  const recording = await prisma.recording.findUnique({
    where: { id: recordingId },
    select: {
      id: true,
      status: true,
      stopped_at: true,
      failed_at: true,
      failure_reason: true,
      track: {
        select: {
          id: true,
        },
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

  const participantMasters = await listParticipantMasterStatesForRecording(recordingId);
  const applicableParticipantMasters = participantMasters.filter((participant) => participant.isApplicable);
  const failedParticipantMaster = applicableParticipantMasters.find((participant) => participant.state === 'failed');
  if (failedParticipantMaster) {
    if (
      recording.status !== recording_status.error ||
      recording.failure_reason !== failedParticipantMaster.failureReason
    ) {
      await prisma.recording.update({
        where: { id: recordingId },
        data: {
          status: recording_status.error,
          failed_at: new Date(),
          failure_reason:
            (failedParticipantMaster.failureReason ?? 'participant_master_failed').slice(0, 1000),
        },
      });
    }
    return { code: 'skipped' as const, reason: 'participant_assets_failed' as const };
  }

  const allParticipantMastersReady =
    applicableParticipantMasters.length > 0 &&
    applicableParticipantMasters.every(
      (participant) => participant.state === 'ready' && participant.asset?.storageKey
    );

  if (!allParticipantMastersReady) {
    if (recording.status !== recording_status.processing) {
      await prisma.recording.update({
        where: { id: recordingId },
        data: {
          status: recording_status.processing,
          failed_at: null,
          failure_reason: null,
        },
      });
    }
    return { code: 'skipped' as const, reason: 'participant_assets_not_ready' as const };
  }

  const combined = await reconcileCombinedAssetForRecording({ recordingId });
  if (combined.code === 'skipped') {
    if (recording.status !== recording_status.processing) {
      await prisma.recording.update({
        where: { id: recordingId },
        data: {
          status: recording_status.processing,
          failed_at: null,
          failure_reason: null,
        },
      });
    }
    return { code: 'skipped' as const, reason: 'combined_not_ready' as const };
  }
  if (combined.code === 'failed') {
    if (
      recording.status !== recording_status.error ||
      recording.failure_reason !== combined.message
    ) {
      await prisma.recording.update({
        where: { id: recordingId },
        data: {
          status: recording_status.error,
          failed_at: new Date(),
          failure_reason: combined.message.slice(0, 1000),
        },
      });
    }
    return { code: 'skipped' as const, reason: 'combined_failed' as const };
  }

  const requiredExports = await upsertRequiredExportArtifacts({
    recordingId,
    combinedAssetId: combined.asset.id,
  });

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
        data: {
          status: recording_status.error,
          failed_at: new Date(),
        },
      });
    }

    return { code: 'ok' as const, status: recording_status.error };
  }

  if (allSucceeded) {
    if (recording.status !== recording_status.ready) {
      await prisma.recording.update({
        where: { id: recordingId },
        data: {
          status: recording_status.ready,
          failed_at: null,
          failure_reason: null,
        },
      });
    }

    return { code: 'ok' as const, status: recording_status.ready };
  }

  if (recording.status !== recording_status.processing) {
    await prisma.recording.update({
      where: { id: recordingId },
      data: {
        status: recording_status.processing,
        failed_at: null,
        failure_reason: null,
      },
    });
  }

  return { code: 'ok' as const, status: recording_status.processing };
}
