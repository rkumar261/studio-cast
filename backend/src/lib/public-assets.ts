const LEGACY_TRACK_FINAL_KEY_RE = /^recordings\/[^/]+\/tracks\/[^/]+\/final\/[^/]+\.(mp4|wav)$/i;
const PARTICIPANT_MASTER_KEY_RE = /^recordings\/[^/]+\/participants\/[^/]+\/master\.(mp4|wav)$/i;
const COMBINED_MASTER_KEY_RE = /^recordings\/[^/]+\/combined\/all-participants\.(mp4|wav)$/i;
const EXPORT_KEY_RE = /^recordings\/[^/]+\/exports\/[^/]+\/[^/]+\.(mp4|wav)$/i;
const TRANSCRIPT_KEY_RE = /^recordings\/[^/]+\/transcript\/.+$/i;

export function isPublicDeliverableStorageKey(storageKey?: string | null): boolean {
  if (!storageKey) return false;
  const normalized = String(storageKey).replace(/^\/+/, '');
  return (
    PARTICIPANT_MASTER_KEY_RE.test(normalized) ||
    COMBINED_MASTER_KEY_RE.test(normalized) ||
    EXPORT_KEY_RE.test(normalized) ||
    TRANSCRIPT_KEY_RE.test(normalized) ||
    LEGACY_TRACK_FINAL_KEY_RE.test(normalized)
  );
}

export function toPublicAssetUrl(storageKey?: string | null): string | undefined {
  if (!storageKey || !isPublicDeliverableStorageKey(storageKey)) return undefined;
  const base = (process.env.R2_PUBLIC_BASE_URL ?? '').trim().replace(/\/+$/, '');
  if (!base) return undefined;
  return `${base}/${String(storageKey).replace(/^\/+/, '')}`;
}

export function buildParticipantMasterKey(args: {
  recordingId: string;
  participantId: string;
  extension: '.mp4' | '.wav';
}) {
  return `recordings/${args.recordingId}/participants/${args.participantId}/master${args.extension}`;
}
