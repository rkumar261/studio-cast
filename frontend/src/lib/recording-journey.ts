import type { ConsumerRecordingState } from '@/lib/api';

export type HostStudioPhase =
  | 'host_prepared'
  | 'recording_active'
  | 'stop_requested'
  | 'uploading_after_stop'
  | 'studio_upload_complete'
  | 'project_processing'
  | 'project_ready';

export function toConsumerStateLabel(state: ConsumerRecordingState) {
  if (state === 'upload complete') return 'Upload complete';
  if (state === 'action required') return 'Action required';
  if (state === 'invited') return 'Invited';
  return state.charAt(0).toUpperCase() + state.slice(1);
}

export function consumerStateBadgeClass(state: ConsumerRecordingState) {
  if (state === 'ready') return 'border-emerald-600/50 bg-emerald-500/10 text-emerald-200';
  if (state === 'processing') return 'border-cyan-600/50 bg-cyan-500/10 text-cyan-200';
  if (state === 'uploading') return 'border-amber-600/50 bg-amber-500/10 text-amber-200';
  if (state === 'upload complete') return 'border-violet-600/50 bg-violet-500/10 text-violet-200';
  if (state === 'action required') return 'border-red-600/50 bg-red-500/10 text-red-200';
  return 'border-slate-700 bg-slate-900 text-slate-300';
}

export function deriveHostStudioPhase(input: {
  canControlRecording: boolean;
  showPreJoin: boolean;
  isRecording: boolean;
  sessionBusy: boolean;
  sessionStopped: boolean;
  studioState: ConsumerRecordingState;
  projectState: ConsumerRecordingState;
}): HostStudioPhase | null {
  if (!input.canControlRecording || input.showPreJoin) return null;
  if (!input.sessionStopped && !input.isRecording) return 'host_prepared';
  if (input.isRecording) return input.sessionBusy ? 'stop_requested' : 'recording_active';
  if (input.sessionBusy) return 'stop_requested';
  if (input.studioState === 'upload complete') return 'studio_upload_complete';
  if (input.projectState === 'ready') return 'project_ready';
  if (input.projectState === 'processing' || input.projectState === 'action required') {
    return 'project_processing';
  }
  return 'uploading_after_stop';
}

export function deriveGuestUploadState(input: {
  pendingUploads: number;
  failedUploads: number;
}): ConsumerRecordingState {
  if (input.failedUploads > 0) return 'action required';
  if (input.pendingUploads > 0) return 'uploading';
  return 'upload complete';
}
