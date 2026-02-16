'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type ChunkKind = 'audio' | 'video' | 'screen';

export type RollingRecorderSource = {
  kind: ChunkKind;
  trackId: string;
  stream: MediaStream;
};

export type RollingRecorderChunk = {
  kind: ChunkKind;
  trackId: string;
  seq: number;
  blob: Blob;
  bytes: number;
  emittedAt: number;
};

type UseRollingChunkRecorderArgs = {
  enabled: boolean;
  timesliceMs?: number;
  sources: RollingRecorderSource[];
  onChunk: (chunk: RollingRecorderChunk) => void;
  onError?: (message: string) => void;
};

type RecorderState = {
  recorder: MediaRecorder;
  source: RollingRecorderSource;
};

function pickMimeType(kind: ChunkKind): string | undefined {
  const candidates =
    kind === 'audio'
      ? ['audio/webm;codecs=opus', 'audio/webm']
      : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return undefined;
}

function stopRecorder(state: RecorderState) {
  try {
    if (state.recorder.state !== 'inactive') {
      state.recorder.requestData();
      state.recorder.stop();
    }
  } catch {
    // ignore stop errors during teardown
  }
}

export function useRollingChunkRecorder(args: UseRollingChunkRecorderArgs) {
  const timesliceMs = args.timesliceMs ?? 4000;
  const [error, setError] = useState<string | null>(null);
  const [activeKinds, setActiveKinds] = useState<ChunkKind[]>([]);
  const recordersRef = useRef<Map<string, RecorderState>>(new Map());
  const seqByTrackRef = useRef<Map<string, number>>(new Map());
  const onChunkRef = useRef(args.onChunk);
  const onErrorRef = useRef(args.onError);

  useEffect(() => {
    onChunkRef.current = args.onChunk;
  }, [args.onChunk]);

  useEffect(() => {
    onErrorRef.current = args.onError;
  }, [args.onError]);

  const sourceKey = useMemo(() => {
    return args.sources
      .map((source) => `${source.kind}:${source.trackId}:${source.stream.id}`)
      .sort()
      .join('|');
  }, [args.sources]);

  useEffect(() => {
    const teardown = () => {
      for (const state of recordersRef.current.values()) {
        stopRecorder(state);
      }
      recordersRef.current.clear();
      setActiveKinds([]);
    };

    if (!args.enabled) {
      teardown();
      return;
    }

    if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
      const message = 'MediaRecorder is not supported in this browser.';
      setError(message);
      onErrorRef.current?.(message);
      return;
    }

    teardown();
    setError(null);

    for (const source of args.sources) {
      const hasTrack = source.stream.getTracks().some((track) => track.readyState === 'live');
      if (!hasTrack) {
        continue;
      }

      try {
        const mimeType = pickMimeType(source.kind);
        const recorder = mimeType
          ? new MediaRecorder(source.stream, { mimeType })
          : new MediaRecorder(source.stream);

        recorder.ondataavailable = (event) => {
          const blob = event.data;
          if (!blob || blob.size <= 0) return;
          const previousSeq = seqByTrackRef.current.get(source.trackId) ?? 0;
          const nextSeq = previousSeq + 1;
          seqByTrackRef.current.set(source.trackId, nextSeq);

          onChunkRef.current({
            kind: source.kind,
            trackId: source.trackId,
            seq: nextSeq,
            blob,
            bytes: blob.size,
            emittedAt: Date.now(),
          });
        };

        recorder.onerror = () => {
          const message = `Chunk recorder failed for ${source.kind}.`;
          setError(message);
          onErrorRef.current?.(message);
        };

        recorder.start(timesliceMs);
        recordersRef.current.set(source.trackId, { recorder, source });
      } catch (err) {
        const message = `Could not start chunk recorder for ${source.kind}: ${(err as Error)?.message ?? 'unknown error'}`;
        setError(message);
        onErrorRef.current?.(message);
      }
    }

    setActiveKinds(Array.from(recordersRef.current.values()).map((item) => item.source.kind));

    return () => {
      teardown();
    };
  }, [args.enabled, sourceKey, timesliceMs, args.sources]);

  return {
    error,
    activeKinds,
    isRunning: args.enabled && recordersRef.current.size > 0,
  };
}
