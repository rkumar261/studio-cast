import { toConsumerStateLabel, type HostStudioPhase } from '@/lib/recording-journey';
import type { ConsumerRecordingState } from '@/lib/api';

export type RecordingCardState = 'ready' | 'processing' | 'error' | 'draft';

export type RecordingCardViewModel = {
  id: string;
  title: string;
  href: string;
  state: RecordingCardState;
  stateLabel: string;
  createdLabel?: string;
  durationLabel?: string;
  thumbnailUrl?: string;
  primaryAction?: {
    label: string;
    href: string;
  };
};

const PROCESSING_STATES = new Set<ConsumerRecordingState>([
  'recording',
  'uploading',
  'upload complete',
  'processing',
]);

export function toRecordingCardState(state?: string): RecordingCardState {
  if (state === 'ready') return 'ready';
  if (state === 'action required') return 'error';
  if (!state || state === 'invited') return 'draft';
  if (PROCESSING_STATES.has(state as ConsumerRecordingState)) return 'processing';
  return 'draft';
}

export function toRecordingCardStateLabel(state?: string) {
  const normalized = (state ?? 'invited') as ConsumerRecordingState;
  return toConsumerStateLabel(normalized);
}

export function formatRecordingTitle(title?: string | null) {
  const trimmed = title?.trim();
  return trimmed?.length ? trimmed : 'Untitled project';
}

export function formatRecordingDuration(durationMs?: number) {
  if (!durationMs || durationMs <= 0) return undefined;
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatRecordingCreatedLabel(createdAt?: string) {
  if (!createdAt) return undefined;
  return new Date(createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

type BuildRecordingCardInput = {
  id: string;
  title?: string | null;
  state?: string;
  createdAt?: string;
  durationMs?: number;
  thumbnailUrl?: string;
  href?: string;
  primaryAction?: {
    label: string;
    href: string;
  };
};

export function buildRecordingCardViewModel(
  input: BuildRecordingCardInput
): RecordingCardViewModel {
  return {
    id: input.id,
    title: formatRecordingTitle(input.title),
    href: input.href ?? `/projects/${input.id}`,
    state: toRecordingCardState(input.state),
    stateLabel: toRecordingCardStateLabel(input.state),
    createdLabel: formatRecordingCreatedLabel(input.createdAt),
    durationLabel: formatRecordingDuration(input.durationMs),
    thumbnailUrl: input.thumbnailUrl,
    primaryAction: input.primaryAction,
  };
}

export function toTrackAccentClass(state: RecordingCardState) {
  if (state === 'ready') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100';
  if (state === 'processing') return 'border-violet-500/30 bg-violet-500/10 text-violet-100';
  if (state === 'error') return 'border-amber-500/30 bg-amber-500/10 text-amber-100';
  return 'border-slate-700 bg-slate-900 text-slate-300';
}

export type RecordingActionViewModel = {
  label: string;
  href?: string;
  disabled?: boolean;
};

export type RecordingLifecycleCopy = {
  eyebrow: string;
  detail: string;
};

export function lifecycleCopyForPhase(phase: HostStudioPhase | null): RecordingLifecycleCopy {
  if (phase === 'project_ready') {
    return {
      eyebrow: 'Project ready',
      detail: 'Everything is prepared for review, downloads, and exports.',
    };
  }
  if (phase === 'project_processing') {
    return {
      eyebrow: 'Processing project',
      detail: 'Primary outputs are still being assembled in the background.',
    };
  }
  return {
    eyebrow: 'Project workspace',
    detail: 'Open the project to continue editing, downloads, and transcript work.',
  };
}
