'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useRollingChunkRecorder,
  type RollingRecorderChunk,
  type RollingRecorderSource,
} from './useRollingChunkRecorder';
import { useChunkUploadQueue, type ChunkUploadProtocol } from './useChunkUploadQueue';
import { StudioRecordingAPI } from './internal-api';

type SessionMode = 'meet' | 'studio';
type RecorderKind = 'audio' | 'video' | 'screen';
type RecordingStreams = Partial<Record<RecorderKind, MediaStream | null>>;

type UseStudioRecordingArgs = {
  sessionMode: SessionMode;
  requestedStudioRole: 'host' | 'guest' | null;
  guestClaimReady: boolean;
  recordingId: string;
  recorderParticipantId: string | null;
  recordingStreams: RecordingStreams;
  isRecording: boolean;
  recordingSessionStartedAt?: string;
  recordingSessionStoppedAt?: string;
  sessionStartedAt: string | null;
  chunkUploadProtocol: ChunkUploadProtocol;
  chunkUploadQueue: ReturnType<typeof useChunkUploadQueue>;
  resetKey: string;
};

export function resolveFinalTrackSeq(
  observedFinalSeq: number,
  recoveredNextSeq?: number
) {
  const recoveredFinalSeq =
    typeof recoveredNextSeq === 'number' && Number.isFinite(recoveredNextSeq)
      ? Math.max(0, Math.floor(recoveredNextSeq) - 1)
      : 0;

  return Math.max(observedFinalSeq, recoveredFinalSeq);
}

export function useStudioRecording(args: UseStudioRecordingArgs) {
  const [trackIdByKind, setTrackIdByKind] = useState<Partial<Record<RecorderKind, string>>>({});
  const [recoveredNextSeqByTrack, setRecoveredNextSeqByTrack] = useState<Record<string, number>>({});
  const [recoveryReadyByTrack, setRecoveryReadyByTrack] = useState<Record<string, boolean>>({});
  const [recorderError, setRecorderError] = useState<string | null>(null);
  const [actualRecorderStartedAt, setActualRecorderStartedAt] = useState<string | null>(null);

  const registeringKindsRef = useRef<Set<RecorderKind>>(new Set());
  const recoveringTrackIdsRef = useRef<Set<string>>(new Set());
  const latestChunkSeqByTrackRef = useRef<Map<string, number>>(new Map());
  const prevGuestStoppedAtRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    setTrackIdByKind({});
    setRecoveredNextSeqByTrack({});
    setRecoveryReadyByTrack({});
    setRecorderError(null);
    setActualRecorderStartedAt(null);
    registeringKindsRef.current.clear();
    recoveringTrackIdsRef.current.clear();
    latestChunkSeqByTrackRef.current.clear();
    prevGuestStoppedAtRef.current = undefined;
  }, [args.resetKey]);

  useEffect(() => {
    if (args.sessionMode !== 'studio' || !args.isRecording) return;
    if (args.requestedStudioRole === 'guest' && !args.guestClaimReady) return;
    if (!args.recorderParticipantId) return;
    const participantId = args.recorderParticipantId;

    const kinds = Object.keys(args.recordingStreams) as RecorderKind[];

    kinds.forEach((kind) => {
      const stream = args.recordingStreams[kind];
      if (!stream) return;
      if (trackIdByKind[kind]) return;
      if (registeringKindsRef.current.has(kind)) return;

      registeringKindsRef.current.add(kind);
      void StudioRecordingAPI.registerTrack(args.recordingId, {
        participantId,
        kind,
      })
        .then((res) => {
          setTrackIdByKind((prev) => {
            if (prev[kind]) return prev;
            return { ...prev, [kind]: res.track.id };
          });
          setRecorderError(null);
        })
        .catch((err) => {
          setRecorderError((err as Error)?.message ?? `Could not register ${kind} track.`);
        })
        .finally(() => {
          registeringKindsRef.current.delete(kind);
        });
    });
  }, [
    args.guestClaimReady,
    args.isRecording,
    args.recorderParticipantId,
    args.recordingId,
    args.recordingStreams,
    args.requestedStudioRole,
    args.sessionMode,
    trackIdByKind,
  ]);

  const rollingRecorderSources = useMemo<RollingRecorderSource[]>(() => {
    const kinds: RecorderKind[] = ['audio', 'video', 'screen'];
    const sources: RollingRecorderSource[] = [];

    kinds.forEach((kind) => {
      const stream = args.recordingStreams[kind];
      const trackId = trackIdByKind[kind];
      if (!stream || !trackId) return;
      sources.push({
        kind,
        trackId,
        stream,
      });
    });

    return sources;
  }, [args.recordingStreams, trackIdByKind]);

  const recoverTrackChunkState = useCallback(
    async (trackId: string) => {
      if (!trackId || recoveringTrackIdsRef.current.has(trackId)) return;
      recoveringTrackIdsRef.current.add(trackId);

      try {
        const response = await StudioRecordingAPI.getTrackChunkRecovery(args.recordingId, trackId);
        const highestExistingSeq = Math.max(0, Math.floor(response.recovery.highestExistingSeq));
        const highestContiguousUploadedSeq = Math.max(
          0,
          Math.floor(response.recovery.highestContiguousUploadedSeq)
        );
        const nextSeq = Math.max(1, Math.floor(response.recovery.nextSeq));

        setRecoveredNextSeqByTrack((prev) =>
          prev[trackId] === nextSeq ? prev : { ...prev, [trackId]: nextSeq }
        );
        setRecoveryReadyByTrack((prev) => (prev[trackId] ? prev : { ...prev, [trackId]: true }));

        await args.chunkUploadQueue.reconcileTrackRecovery({
          recordingId: args.recordingId,
          trackId,
          highestExistingSeq,
          highestContiguousUploadedSeq,
        });

        setRecorderError((prev) => {
          if (!prev) return prev;
          if (!prev.includes('recover track chunk state')) return prev;
          return null;
        });
      } catch (err) {
        setRecoveryReadyByTrack((prev) => ({ ...prev, [trackId]: false }));
        setRecorderError(
          (err as Error)?.message ?? `Failed to recover track chunk state for ${trackId}.`
        );
      } finally {
        recoveringTrackIdsRef.current.delete(trackId);
      }
    },
    [args.chunkUploadQueue, args.recordingId]
  );

  useEffect(() => {
    if (args.sessionMode !== 'studio' || !args.isRecording) return;

    const trackIds = Array.from(new Set(rollingRecorderSources.map((source) => source.trackId)));
    trackIds.forEach((trackId) => {
      if (recoveryReadyByTrack[trackId]) return;
      void recoverTrackChunkState(trackId);
    });
  }, [args.isRecording, args.sessionMode, recoverTrackChunkState, recoveryReadyByTrack, rollingRecorderSources]);

  useEffect(() => {
    if (args.sessionMode !== 'studio') return;
    const onOnline = () => {
      if (!args.isRecording) return;
      const trackIds = Array.from(new Set(rollingRecorderSources.map((source) => source.trackId)));
      trackIds.forEach((trackId) => {
        void recoverTrackChunkState(trackId);
      });
    };
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
    };
  }, [args.isRecording, args.sessionMode, recoverTrackChunkState, rollingRecorderSources]);

  const recoveredRollingRecorderSources = useMemo(
    () => rollingRecorderSources.filter((source) => recoveryReadyByTrack[source.trackId]),
    [recoveryReadyByTrack, rollingRecorderSources]
  );

  const onChunkEmitted = useCallback(
    (chunk: RollingRecorderChunk) => {
      const previous = latestChunkSeqByTrackRef.current.get(chunk.trackId) ?? 0;
      if (chunk.seq > previous) {
        latestChunkSeqByTrackRef.current.set(chunk.trackId, chunk.seq);
      }

      void args.chunkUploadQueue
        .enqueue({
          recordingId: args.recordingId,
          trackId: chunk.trackId,
          seq: chunk.seq,
          kind: chunk.kind,
          protocol: args.chunkUploadProtocol,
          blob: chunk.blob,
          bytes: chunk.bytes,
          emittedAt: chunk.emittedAt,
        })
        .catch((err) => {
          setRecorderError((err as Error)?.message ?? 'Failed to enqueue chunk upload.');
        });
    },
    [args.chunkUploadProtocol, args.chunkUploadQueue, args.recordingId]
  );

  const finalizeTrackCaptures = useCallback(async () => {
    if (args.sessionMode !== 'studio') return;
    const trackIds = Array.from(
      new Set(Object.values(trackIdByKind).filter((value): value is string => !!value))
    );
    if (trackIds.length === 0) return;

    const captureClosedAt = new Date().toISOString();
    // Prefer the actual MediaRecorder start time when available. Guests can join a few
    // seconds after the host starts the session, so sessionStartedAt alone is less accurate.
    const startedAt =
      actualRecorderStartedAt ?? args.sessionStartedAt ?? args.recordingSessionStartedAt ?? undefined;

    await Promise.all(
      trackIds.map(async (trackId) => {
        const observedFinalSeq = latestChunkSeqByTrackRef.current.get(trackId) ?? 0;
        const finalSeq = resolveFinalTrackSeq(observedFinalSeq, recoveredNextSeqByTrack[trackId]);
        await StudioRecordingAPI.finalizeTrack(args.recordingId, trackId, {
          finalSeq,
          captureClosedAt,
          recordingStartedAt: startedAt,
        });
      })
    );
  }, [
    actualRecorderStartedAt,
    args.recordingId,
    args.recordingSessionStartedAt,
    args.sessionMode,
    args.sessionStartedAt,
    recoveredNextSeqByTrack,
    trackIdByKind,
  ]);

  useEffect(() => {
    if (args.sessionMode !== 'studio' || args.requestedStudioRole !== 'guest') return;
    const stoppedAt = args.recordingSessionStoppedAt;
    const prev = prevGuestStoppedAtRef.current;
    if (!stoppedAt || prev === stoppedAt) return;
    if (Object.keys(trackIdByKind).length === 0) return;

    prevGuestStoppedAtRef.current = stoppedAt;
    const timer = window.setTimeout(() => {
      void finalizeTrackCaptures().catch(() => {});
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    args.recordingSessionStoppedAt,
    args.requestedStudioRole,
    args.sessionMode,
    finalizeTrackCaptures,
    trackIdByKind,
  ]);

  useRollingChunkRecorder({
    enabled:
      args.sessionMode === 'studio' &&
      args.isRecording &&
      !!args.recorderParticipantId &&
      recoveredRollingRecorderSources.length > 0,
    timesliceMs: 4000,
    sources: recoveredRollingRecorderSources,
    initialNextSeqByTrack: recoveredNextSeqByTrack,
    onChunk: onChunkEmitted,
    onError: setRecorderError,
    onStart: setActualRecorderStartedAt,
  });

  return {
    recorderError,
    finalizeTrackCaptures,
    hasRegisteredTracks: Object.keys(trackIdByKind).length > 0,
  };
}
