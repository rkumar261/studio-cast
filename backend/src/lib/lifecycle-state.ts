import type {
  recording_lifecycle_state,
  recording_status,
  track_lifecycle_state,
  track_state,
} from '@prisma/client';

export type CanonicalRecordingLifecycleState =
  | 'created'
  | 'prejoin'
  | 'idle'
  | 'recording'
  | 'post_stop_uploading'
  | 'upload_complete'
  | 'processing'
  | 'ready'
  | 'blocked';

export type CanonicalTrackLifecycleState =
  | 'recording'
  | 'capture_closed'
  | 'finalized'
  | 'ready_for_stitch'
  | 'stitched'
  | 'processed'
  | 'blocked';

/**
 * BRD/TRD 05 rollout map:
 * - `recording.status` remains the legacy coarse state for existing flows.
 * - `recording.lifecycle_state` is the canonical truth source for lifecycle progression.
 * - Legacy lifecycle values (`preparing`, `stopping`, `uploading`, `failed`) are preserved
 *   so older rows remain readable during rollout; they are normalized here.
 * - `track.state` remains the coarse pipeline state while `track.lifecycle_state` carries the
 *   canonical progression used by diagnostics and gate logic.
 */
export function normalizeRecordingLifecycleState(args: {
  lifecycleState?: recording_lifecycle_state | null;
  status?: recording_status | null;
  startedAt?: Date | null;
  stoppedAt?: Date | null;
  uploadCompletedAt?: Date | null;
}): CanonicalRecordingLifecycleState {
  switch (args.lifecycleState) {
    case 'created':
    case 'prejoin':
    case 'idle':
    case 'recording':
    case 'post_stop_uploading':
    case 'upload_complete':
    case 'processing':
    case 'ready':
    case 'blocked':
      return args.lifecycleState;
    case 'preparing':
      return 'prejoin';
    case 'stopping':
    case 'uploading':
      return args.stoppedAt ? 'post_stop_uploading' : args.startedAt ? 'recording' : 'idle';
    case 'failed':
      return 'blocked';
    default:
      break;
  }

  if (args.status === 'ready') return 'ready';
  if (args.status === 'processing') return 'processing';
  if (args.status === 'error') return 'blocked';
  if (args.uploadCompletedAt) return 'upload_complete';
  if (args.stoppedAt) return 'post_stop_uploading';
  if (args.startedAt) return 'recording';
  return 'created';
}

export function normalizeTrackLifecycleState(args: {
  lifecycleState?: track_lifecycle_state | null;
  state?: track_state | null;
  captureClosedAt?: Date | null;
  finalSeq?: number | null;
  storageKeyRaw?: string | null;
  storageKeyFinal?: string | null;
  failureReason?: string | null;
}): CanonicalTrackLifecycleState {
  switch (args.lifecycleState) {
    case 'recording':
    case 'capture_closed':
    case 'finalized':
    case 'ready_for_stitch':
    case 'stitched':
    case 'processed':
    case 'blocked':
      return args.lifecycleState;
    case 'registered':
      return 'recording';
    case 'ingest_ready':
      return 'ready_for_stitch';
    case 'transcoded':
    case 'ready':
      return 'processed';
    case 'failed':
      return 'blocked';
    default:
      break;
  }

  if (args.failureReason) return 'blocked';
  if (args.storageKeyFinal || args.state === 'processed') return 'processed';
  if (args.storageKeyRaw || args.state === 'uploaded') return 'stitched';
  if (args.finalSeq != null) return 'finalized';
  if (args.captureClosedAt) return 'capture_closed';
  return 'recording';
}
