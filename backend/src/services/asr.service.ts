export type AsrSegment = {
  startMs: number;
  endMs: number;
  text: string;
  speaker?: string;
  confidence?: number;
};

export async function runAsrForTrack(opts: {
  sourceStorageKey: string;
  sourceType?: 'track' | 'participant_asset' | 'combined_asset';
  durationMs?: number | null;
  language?: string;
}): Promise<{ segments: AsrSegment[] }> {
  const { durationMs, sourceStorageKey, sourceType } = opts;
  const totalMs = Math.max(2000, durationMs ?? 10_000);
  const chunkSizeMs = Math.max(2000, Math.floor(totalMs / 3));
  const sourceLabel =
    sourceType === 'combined_asset'
      ? 'combined recording'
      : sourceType === 'participant_asset'
      ? 'participant recording'
      : 'track recording';
  const sourceHint = sourceStorageKey.split('/').slice(-2).join('/');

  const segments: AsrSegment[] = [];
  let start = 0;
  let idx = 1;
  while (start < totalMs) {
    const end = Math.min(totalMs, start + chunkSizeMs);
    segments.push({
      startMs: start,
      endMs: end,
      text: `Transcript segment ${idx} from ${sourceLabel} (${sourceHint}).`,
      speaker: idx % 2 === 0 ? 'Speaker 2' : 'Speaker 1',
      confidence: 0.82,
    });
    start = end;
    idx += 1;
  }

  return { segments };
}
