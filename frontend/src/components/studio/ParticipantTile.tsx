'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { MediaSource, Tile } from '@/lib/studio/media';

function useAttachMedia<T extends HTMLMediaElement>(
  mediaRef: RefObject<T | null>,
  source?: MediaSource,
  kind: 'video' | 'audio' = 'video'
) {
  const sourceKind = source?.kind;
  const sourceTrack = source?.kind === 'livekit' ? source.track : null;
  const sourceStream = source?.kind === 'media' ? source.stream : null;

  useEffect(() => {
    const element = mediaRef.current;
    if (!element) return;

    if (!sourceKind) {
      if ('srcObject' in element) {
        (element as HTMLMediaElement).srcObject = null;
      }
      return;
    }

    if (sourceKind === 'livekit') {
      if (!sourceTrack) return;
      sourceTrack.attach(element);
      return () => {
        try {
          sourceTrack.detach(element);
        } catch {
          // ignore
        }
      };
    }

    if (sourceKind === 'media') {
      (element as HTMLMediaElement).srcObject = sourceStream ?? null;
      element.play?.().catch(() => {});
      return () => {
        try {
          (element as HTMLMediaElement).srcObject = null;
        } catch {
          // ignore
        }
      };
    }
  }, [kind, mediaRef, sourceKind, sourceStream, sourceTrack]);
}

export function ParticipantTile({
  tile,
  className,
  showPin = false,
  isPinned = false,
  onPin,
  micPublishEnabled,
  onTogglePublishMic,
  fit = 'cover',
  fill = false,
  showBadge = true,
}: {
  tile: Tile;
  className?: string;
  showPin?: boolean;
  isPinned?: boolean;
  onPin?: () => void;
  micPublishEnabled?: boolean;
  onTogglePublishMic?: () => void;
  fit?: 'cover' | 'contain';
  fill?: boolean;
  showBadge?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const controlsHideTimerRef = useRef<number | null>(null);
  const [showControlsOnClick, setShowControlsOnClick] = useState(false);
  const [isTileMuted, setIsTileMuted] = useState(Boolean(tile.muted));

  const hasVideo = tile.video.kind === 'livekit'
    ? !!tile.video.track
    : !!tile.video.stream;
  const remoteMicOff = !!tile.micOff;
  const isAudioMuted = isTileMuted;
  const isPublishMicControl = typeof micPublishEnabled === 'boolean' && !!onTogglePublishMic;
  const shouldMutePlayback = isPublishMicControl ? isAudioMuted : (isAudioMuted || remoteMicOff);
  const micIsOff = isPublishMicControl ? !micPublishEnabled : shouldMutePlayback;

  useAttachMedia(videoRef, tile.video, 'video');
  useAttachMedia(audioRef, shouldMutePlayback ? undefined : tile.audio, 'audio');

  useEffect(() => {
    return () => {
      if (controlsHideTimerRef.current) {
        window.clearTimeout(controlsHideTimerRef.current);
      }
    };
  }, []);

  const revealControls = useCallback(() => {
    setShowControlsOnClick(true);
    if (controlsHideTimerRef.current) {
      window.clearTimeout(controlsHideTimerRef.current);
    }
    controlsHideTimerRef.current = window.setTimeout(() => {
      setShowControlsOnClick(false);
    }, 2200);
  }, []);

  return (
    <div
      onClick={() => {
        if (!showPin || !onPin) return;
        revealControls();
      }}
      className={`studio-rise studio-panel-muted group relative w-full ${fill ? 'h-full' : 'aspect-video'} overflow-hidden rounded-2xl ${className ?? ''}`}
    >
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-slate-900/30 via-transparent to-slate-950/60" />
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={tile.muted}
          className={`h-full w-full ${fit === 'contain' ? 'object-contain bg-black' : 'object-cover'}`}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400 text-center px-4">
          No video track available.
        </div>
      )}

      {tile.audio && !shouldMutePlayback && (
        <audio ref={audioRef} autoPlay playsInline className="hidden" />
      )}

      {showBadge && !!tile.badge && (
        <div className="studio-chip-surface absolute left-3 top-3 rounded-full px-3 py-1 text-[11px] text-slate-100">
          {tile.badge}
        </div>
      )}
      {showPin && onPin && (
        <div
          className={`absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 transition-opacity duration-150 ${
            showControlsOnClick
              ? 'pointer-events-auto opacity-100'
              : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100'
          }`}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (isPublishMicControl) {
                onTogglePublishMic();
                return;
              }
              setIsTileMuted((prev) => !prev);
            }}
            className={`flex h-9 w-9 items-center justify-center rounded-full border ${
              micIsOff
                ? 'border-rose-300/50 bg-rose-500/20 text-rose-100'
                : 'studio-chip-surface text-slate-100'
            }`}
            title={micIsOff ? 'Unmute participant' : 'Mute participant'}
            aria-label={micIsOff ? 'Unmute participant' : 'Mute participant'}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="4" width="6" height="10" rx="3" />
              <path d="M6 11a6 6 0 0 0 12 0M12 17v3M9 20h6" />
              {micIsOff && <line x1="5" y1="19" x2="19" y2="5" />}
            </svg>
          </button>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onPin();
            }}
            className={`flex h-9 w-9 items-center justify-center rounded-full border ${
              isPinned
                ? 'border-cyan-300/50 bg-cyan-500/25 text-cyan-100'
                : 'studio-chip-surface text-slate-100'
            }`}
            title={isPinned ? 'Unpin from stage' : 'Pin to stage'}
            aria-label={isPinned ? 'Unpin from stage' : 'Pin to stage'}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3h8l-1.5 5 3.5 3v1H6v-1l3.5-3L8 3zM12 12v9" />
            </svg>
          </button>
        </div>
      )}
      <div className="studio-chip-surface absolute left-3 bottom-3 rounded-full px-3 py-1 text-[11px] text-slate-100">
        {tile.label}
      </div>
    </div>
  );
}
