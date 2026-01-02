export type AsrSegment = {
  startMs: number;
  endMs: number;
  text: string;
  speaker?: string;
  confidence?: number;
};

/**
 * Later we'll:
 *  - download the audio file for storageKeyFinal
 *  - normalize/convert to 16k mono wav if needed
 *  - call your ASR provider (Whisper, cloud ASR, etc.)
 *  - return normalized segments.
 */
export async function runAsrForTrack(opts: {
  storageKeyFinal: string;
  durationMs?: number | null;
}): Promise<{ segments: AsrSegment[] }> {
  const { durationMs } = opts;

  // TEMP: dummy implementation. Behavior similar to what you had in the worker.
  const totalMs = durationMs ?? 10_000;

  const segments: AsrSegment[] = [
    {
      startMs: 0,
      endMs: Math.min(totalMs, 5_000),
      text: 'Dummy transcript segment 1 (replace with real ASR).',
    },
    {
      startMs: Math.min(totalMs, 5_000),
      endMs: totalMs,
      text: 'Dummy transcript segment 2 (replace with real ASR).',
    },
  ];

  return { segments };
}
