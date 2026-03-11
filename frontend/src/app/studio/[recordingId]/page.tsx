'use client';

import React, { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Space_Grotesk } from 'next/font/google';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  LiveKitAPI,
  ParticipantsAPI,
  RecordingsAPI,
  type RecordingProgressResponse,
  type RecordingSessionResponse,
} from '@/lib/api';
import {
  useRollingChunkRecorder,
  type RollingRecorderChunk,
  type RollingRecorderSource,
} from '@/lib/studio/useRollingChunkRecorder';
import { useChunkUploadQueue, type ChunkUploadProtocol } from '@/lib/studio/useChunkUploadQueue';
import { useSession } from '@/lib/useSession';
import {
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteParticipant,
} from 'livekit-client';
import { useMeshRoom } from '@/lib/studio/useMeshRoom';
import UploadStatusModal from '@/components/studio/UploadStatusModal';

type RouteParams = {
  recordingId: string;
};

type StudioPageProps = {
  params: Promise<RouteParams>;
};

type Engine = 'livekit' | 'mesh';

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';
type SessionMode = 'meet' | 'studio';
type DeviceOption = { id: string; label: string };

type MediaSource =
  | { kind: 'livekit'; track: Track | null }
  | { kind: 'media'; stream: MediaStream | null };

type Tile = {
  key: string;
  label: string;
  badge: string;
  video: MediaSource;
  audio?: MediaSource;
  muted?: boolean;
  micOff?: boolean;
};

type RecorderKind = 'audio' | 'video' | 'screen';
type StudioControlIconKind =
  | 'mark'
  | 'mic'
  | 'cam'
  | 'speaker'
  | 'react'
  | 'raise'
  | 'layout'
  | 'script'
  | 'share'
  | 'leave';
type StudioSidebarIconKind = 'people' | 'chat' | 'brand' | 'text' | 'media';

type HostStudioLifecyclePhase =
  | 'recording'
  | 'stopping'
  | 'uploading'
  | 'upload_complete'
  | 'processing_handoff';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const mediaSource = (stream: MediaStream | null): MediaSource => ({
  kind: 'media',
  stream,
});

const livekitSource = (track: Track | null): MediaSource => ({
  kind: 'livekit',
  track,
});

function livekitTrackToStream(track: Track | null): MediaStream | null {
  const mediaStreamTrack = (track as any)?.mediaStreamTrack as MediaStreamTrack | undefined;
  if (!mediaStreamTrack) return null;
  if (mediaStreamTrack.readyState !== 'live') return null;
  return new MediaStream([mediaStreamTrack]);
}

function selectTracksAsStream(stream: MediaStream | null, kind: 'audio' | 'video'): MediaStream | null {
  if (!stream) return null;
  const tracks = kind === 'audio' ? stream.getAudioTracks() : stream.getVideoTracks();
  if (tracks.length === 0) return null;
  return new MediaStream(tracks);
}

function getTrack(participant: Participant, source: Track.Source): Track | null {
  const pub = participant.getTrackPublication(source);
  return pub?.track ?? null;
}

function tokenFromMagicLink(magicLink?: string): string | null {
  if (!magicLink) return null;
  try {
    const parsed = new URL(magicLink, window.location.origin);
    const fromQuery = parsed.searchParams.get('guestToken')?.trim();
    if (fromQuery) return fromQuery;
    const segment = parsed.pathname.split('/').filter(Boolean).pop()?.trim();
    return segment || null;
  } catch {
    const segment = magicLink.split('/').filter(Boolean).pop()?.trim();
    return segment || null;
  }
}

function buildStudioInviteLink(args: {
  origin: string;
  recordingId: string;
  role: 'guest' | 'host';
  participantId?: string | null;
  guestToken?: string | null;
}) {
  const url = new URL(`/studio/${args.recordingId}`, args.origin);
  url.searchParams.set('mode', 'studio');
  url.searchParams.set('role', args.role);
  if (args.participantId) {
    url.searchParams.set('participantId', args.participantId);
  }
  if (args.role === 'guest' && args.guestToken) {
    url.searchParams.set('guestToken', args.guestToken);
  }
  return url.toString();
}

function useAttachMedia<T extends HTMLMediaElement>(
  mediaRef: React.RefObject<T | null>,
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

function ParticipantTile({
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
      className={`studio-rise group relative w-full ${fill ? 'h-full' : 'aspect-video'} overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70 ${className ?? ''}`}
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
        <div className="absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1 text-[11px] text-slate-100">
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
                : 'border-slate-600/60 bg-black/45 text-slate-100'
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
                : 'border-slate-600/60 bg-black/45 text-slate-100'
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
      <div className="absolute left-3 bottom-3 rounded-full bg-black/60 px-3 py-1 text-[11px] text-slate-100">
        {tile.label}
      </div>
    </div>
  );
}

function StudioControlIcon({ kind, off = false }: { kind: StudioControlIconKind; off?: boolean }) {
  const icon = (() => {
    switch (kind) {
      case 'mark':
        return <path d="M12 3 19 6v6c0 5-3.5 7.8-7 9-3.5-1.2-7-4-7-9V6l7-3z" />;
      case 'mic':
        return (
          <>
            <rect x="9" y="4" width="6" height="10" rx="3" />
            <path d="M6 11a6 6 0 0 0 12 0M12 17v3M9 20h6" />
          </>
        );
      case 'cam':
        return (
          <>
            <rect x="3" y="7" width="13" height="10" rx="2" />
            <path d="M16 10 21 7v10l-5-3z" />
          </>
        );
      case 'speaker':
        return (
          <>
            <path d="M4 13h4l5 4V7l-5 4H4z" />
            <path d="M16 10a4 4 0 0 1 0 4M18 8a7 7 0 0 1 0 8" />
          </>
        );
      case 'react':
        return (
          <>
            <circle cx="12" cy="12" r="8" />
            <circle cx="9" cy="10" r="1" />
            <circle cx="15" cy="10" r="1" />
            <path d="M8 14c1 2 3 3 4 3s3-1 4-3" />
            <path d="M18 4v4M16 6h4" />
          </>
        );
      case 'raise':
        return (
          <path d="M8 12V7.2a1.6 1.6 0 1 1 3.2 0V11M11.2 11V5.8a1.6 1.6 0 1 1 3.2 0V11M14.4 11V6.6a1.6 1.6 0 1 1 3.2 0v8.3A6.1 6.1 0 0 1 11.5 21h-.4A6.1 6.1 0 0 1 5 14.9v-2.3a1.6 1.6 0 1 1 3.2 0V12z" />
        );
      case 'layout':
        return (
          <>
            <rect x="4" y="5" width="16" height="14" rx="2" />
            <path d="M12 5v14M4 12h16" />
          </>
        );
      case 'script':
        return (
          <>
            <rect x="5" y="4" width="14" height="16" rx="2" />
            <path d="M8 9h8M8 13h8M8 17h6" />
          </>
        );
      case 'share':
        return (
          <>
            <path d="M12 4v11M8 8l4-4 4 4" />
            <rect x="5" y="14" width="14" height="6" rx="2" />
          </>
        );
      case 'leave':
        return (
          <path d="M22 16.9v2.2a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 11.2 18a19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.2 1h2.2a2 2 0 0 1 2 1.7c.1 1 .4 1.9.8 2.8a2 2 0 0 1-.4 2.1l-.9.9a16 16 0 0 0 6 6l.9-.9a2 2 0 0 1 2.1-.4c.9.4 1.8.7 2.8.8a2 2 0 0 1 1.7 2z" />
        );
      default:
        return null;
    }
  })();

  return (
    <span className="relative inline-flex h-5 w-5 items-center justify-center">
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {icon}
      </svg>
      {off && (
        <svg
          viewBox="0 0 24 24"
          className="pointer-events-none absolute inset-0 h-5 w-5 text-rose-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        >
          <line x1="4" y1="20" x2="20" y2="4" />
        </svg>
      )}
    </span>
  );
}

function StudioSidebarIcon({ kind }: { kind: StudioSidebarIconKind }) {
  const icon = (() => {
    switch (kind) {
      case 'people':
        return (
          <>
            <circle cx="9" cy="9" r="2.5" />
            <circle cx="16" cy="10" r="2" />
            <path d="M4.5 18a4.5 4.5 0 0 1 9 0" />
            <path d="M13 18a3.5 3.5 0 0 1 7 0" />
          </>
        );
      case 'chat':
        return (
          <>
            <path d="M5 6h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10l-5 4v-4H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
            <path d="M8 10h8M8 13h6" />
          </>
        );
      case 'brand':
        return (
          <>
            <rect x="4" y="6" width="16" height="12" rx="2" />
            <circle cx="9" cy="10" r="1.5" />
            <path d="m20 15-4.2-4.2L10 16" />
          </>
        );
      case 'text':
        return (
          <>
            <path d="M5 6h14M12 6v12" />
            <path d="M9 18h6" />
          </>
        );
      case 'media':
        return <path d="M15 5v10.7a2.7 2.7 0 1 1-2.2-2.6V8h6V5z" />;
      default:
        return null;
    }
  })();

  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icon}
    </svg>
  );
}

export default function StudioRecordingPage({ params }: StudioPageProps) {
  const { recordingId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useSession();
  const sessionMode: SessionMode = searchParams.get('mode') === 'meet' ? 'meet' : 'studio';
  const requestedStudioRole = searchParams.get('role') === 'host'
    ? 'host'
    : searchParams.get('role') === 'guest'
      ? 'guest'
      : null;
  const requestedParticipantId = searchParams.get('participantId')?.trim() || null;
  const requestedGuestToken = searchParams.get('guestToken')?.trim() || null;
  const isGuestStudioFlow = sessionMode === 'studio' && requestedStudioRole === 'guest';

  const meshMaxPeers = Number(process.env.NEXT_PUBLIC_MESH_MAX_PEERS ?? '4');

  const [engine, setEngine] = useState<Engine>('livekit');
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [pinnedTileKey, setPinnedTileKey] = useState<string | null>(null);
  const [showPreJoin, setShowPreJoin] = useState(sessionMode === 'studio');
  const [displayName, setDisplayName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPreJoinStep, setGuestPreJoinStep] = useState<'welcome' | 'prejoin'>(
    isGuestStudioFlow ? 'welcome' : 'prejoin'
  );
  const [guestJoinError, setGuestJoinError] = useState<string | null>(null);
  const [usingHeadphones, setUsingHeadphones] = useState(true);
  const [preJoinStatus, setPreJoinStatus] = useState<'idle' | 'starting' | 'ready' | 'error'>('idle');
  const [preJoinError, setPreJoinError] = useState<string | null>(null);
  const [joiningFromPreJoin, setJoiningFromPreJoin] = useState(false);
  const [preJoinMicEnabled, setPreJoinMicEnabled] = useState(true);
  const [preJoinCamEnabled, setPreJoinCamEnabled] = useState(true);
  const preJoinVideoRef = useRef<HTMLVideoElement | null>(null);
  const preJoinStreamRef = useRef<MediaStream | null>(null);
  const [preJoinPreviewStream, setPreJoinPreviewStream] = useState<MediaStream | null>(null);
  const [cameraDevices, setCameraDevices] = useState<DeviceOption[]>([]);
  const [micDevices, setMicDevices] = useState<DeviceOption[]>([]);
  const [speakerDevices, setSpeakerDevices] = useState<DeviceOption[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [selectedMicId, setSelectedMicId] = useState('');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState('');
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [showStudioInvitePanel, setShowStudioInvitePanel] = useState(true);
  const [showStudioPeoplePanel, setShowStudioPeoplePanel] = useState(true);
  const [showAddParticipantPanel, setShowAddParticipantPanel] = useState(false);
  const [inviteRole, setInviteRole] = useState<'guest' | 'host'>('guest');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [recordingSession, setRecordingSession] = useState<RecordingSessionResponse['session'] | null>(null);
  const [recordingProgress, setRecordingProgress] = useState<RecordingProgressResponse | null>(null);
  const [canControlRecording, setCanControlRecording] = useState(false);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [showUploadStatusModal, setShowUploadStatusModal] = useState(false);
  const [localHostParticipantId, setLocalHostParticipantId] = useState<string | null>(null);
  const [createdInviteParticipantIdByRole, setCreatedInviteParticipantIdByRole] = useState<
    Partial<Record<'guest' | 'host', string>>
  >({});
  const [createdInviteGuestToken, setCreatedInviteGuestToken] = useState<string | null>(null);
  const [claimedGuestParticipantId, setClaimedGuestParticipantId] = useState<string | null>(null);
  const [guestClaimReady, setGuestClaimReady] = useState(
    !isGuestStudioFlow || !requestedGuestToken
  );
  const [trackIdByKind, setTrackIdByKind] = useState<Partial<Record<RecorderKind, string>>>({});
  const [recoveredNextSeqByTrack, setRecoveredNextSeqByTrack] = useState<Record<string, number>>({});
  const [recoveryReadyByTrack, setRecoveryReadyByTrack] = useState<Record<string, boolean>>({});
  const [recorderError, setRecorderError] = useState<string | null>(null);
  const registeringKindsRef = useRef<Set<RecorderKind>>(new Set());
  const recoveringTrackIdsRef = useRef<Set<string>>(new Set());
  const latestChunkSeqByTrackRef = useRef<Map<string, number>>(new Map());
  const [showMeetSelfPreview, setShowMeetSelfPreview] = useState(true);
  const [meetSelfPreviewExpanded, setMeetSelfPreviewExpanded] = useState(false);
  const [meetStageFit, setMeetStageFit] = useState<'contain' | 'cover'>('contain');
  const [showMeetPeoplePanel, setShowMeetPeoplePanel] = useState(true);
  const [showMeetViewMenu, setShowMeetViewMenu] = useState(false);
  const [meetContextMenu, setMeetContextMenu] = useState<{
    x: number;
    y: number;
    tileKey: string;
    isMain: boolean;
  } | null>(null);
  const meetStageRef = useRef<HTMLDivElement | null>(null);
  const hostParticipantEnsureRef = useRef<Promise<string | null> | null>(null);

  // ===== LiveKit state =====
  const [room, setRoom] = useState<Room | null>(null);
  const roomRef = useRef<Room | null>(null);

  const [livekitStatus, setLivekitStatus] = useState<ConnectionStatus>('idle');
  const [livekitError, setLivekitError] = useState<string | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);

  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const isRecording = !!recordingSession?.startedAt && !recordingSession?.stoppedAt;
  const chunkUploadProtocol: ChunkUploadProtocol = 'tus';
  const chunkUploadQueue = useChunkUploadQueue({
    enabled: sessionMode === 'studio',
    recordingId,
    concurrency: 2,
    maxRetries: 8,
  });

  const localCameraTrack =
    room?.localParticipant.getTrackPublication(Track.Source.Camera)?.track ?? null;
  const localMicTrack =
    room?.localParticipant.getTrackPublication(Track.Source.Microphone)?.track ?? null;
  const localScreenTrack =
    room?.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track ?? null;

  const syncParticipants = useCallback((activeRoom: Room) => {
    setRemoteParticipants(Array.from(activeRoom.remoteParticipants.values()));
  }, []);

  const cleanupLiveKitRoom = useCallback((activeRoom?: Room | null) => {
    const r = activeRoom ?? roomRef.current;
    if (!r) return;
    try {
      r.removeAllListeners();
      r.disconnect();
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanupLiveKitRoom();
    };
  }, [cleanupLiveKitRoom]);

  const refreshRecordingSession = useCallback(async () => {
    if (sessionMode !== 'studio') return;
    if (requestedStudioRole === 'guest' && !guestClaimReady) return;

    try {
      const res = await RecordingsAPI.getSession(recordingId);
      setRecordingSession(res.session);
      setCanControlRecording(requestedStudioRole === 'guest' ? false : res.canControl);
      setSessionError(null);
    } catch (err) {
      setSessionError((err as Error)?.message ?? 'Failed to refresh recording session.');
    }
  }, [guestClaimReady, recordingId, requestedStudioRole, sessionMode]);

  const refreshRecordingProgress = useCallback(async () => {
    if (sessionMode !== 'studio') return;
    if (requestedStudioRole === 'guest' && !guestClaimReady) return;
    try {
      const progress = await RecordingsAPI.getProgress(recordingId);
      setRecordingProgress(progress);
    } catch {
      // keep UI resilient; session/queue UI still functions without progress payload
    }
  }, [guestClaimReady, recordingId, requestedStudioRole, sessionMode]);

  const hasLocalQueueWork =
    sessionMode === 'studio' &&
    (chunkUploadQueue.stats.pending > 0 || chunkUploadQueue.stats.processing > 0);
  const hasBackendPendingFromProgress = (recordingProgress?.participants ?? []).some(
    (participant) => participant.pendingCount > 0
  );
  const shouldPollDuringHostHandoff =
    sessionMode === 'studio' && canControlRecording && !!recordingSession?.stoppedAt;
  const shouldPollStudioSession =
    sessionMode === 'studio' &&
    (!recordingSession?.stoppedAt ||
      isRecording ||
      hasLocalQueueWork ||
      showUploadStatusModal ||
      shouldPollDuringHostHandoff);
  const shouldPollStudioProgress =
    sessionMode === 'studio' &&
    (!recordingSession?.stoppedAt ||
      isRecording ||
      hasLocalQueueWork ||
      hasBackendPendingFromProgress ||
      showUploadStatusModal ||
      shouldPollDuringHostHandoff);

  useEffect(() => {
    if (sessionMode !== 'studio') return;
    void refreshRecordingSession();
    if (!shouldPollStudioSession) return;

    const timer = window.setInterval(() => {
      void refreshRecordingSession();
    }, 5000);

    return () => window.clearInterval(timer);
  }, [
    refreshRecordingSession,
    requestedStudioRole,
    sessionMode,
    shouldPollStudioSession,
  ]);

  useEffect(() => {
    if (sessionMode !== 'studio') return;
    void refreshRecordingProgress();
    if (!shouldPollStudioProgress) return;

    const timer = window.setInterval(() => {
      void refreshRecordingProgress();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [refreshRecordingProgress, sessionMode, shouldPollStudioProgress]);

  useEffect(() => {
    if (sessionMode === 'studio') {
      setShowPreJoin(true);
    } else {
      setShowPreJoin(false);
    }
  }, [recordingId, sessionMode]);

  useEffect(() => {
    if (displayName) return;
    if (profile?.name?.trim()) {
      setDisplayName(profile.name.trim());
      return;
    }
    if (profile?.email) {
      setDisplayName(profile.email.split('@')[0]);
    }
  }, [displayName, profile?.email, profile?.name]);

  useEffect(() => {
    setTrackIdByKind({});
    setRecoveredNextSeqByTrack({});
    setRecoveryReadyByTrack({});
    setRecorderError(null);
    setCreatedInviteGuestToken(null);
    setClaimedGuestParticipantId(null);
    setGuestJoinError(null);
    setGuestEmail('');
    setGuestPreJoinStep(isGuestStudioFlow ? 'welcome' : 'prejoin');
    setGuestClaimReady(!isGuestStudioFlow || !requestedGuestToken);
    registeringKindsRef.current.clear();
    recoveringTrackIdsRef.current.clear();
    latestChunkSeqByTrackRef.current.clear();
    setShowStudioInvitePanel(true);
    setCreatedInviteParticipantIdByRole({});
    setLocalHostParticipantId(null);
  }, [isGuestStudioFlow, recordingId, requestedGuestToken]);

  const shouldRunStudioPreJoinChecks =
    sessionMode === 'studio' && (!isGuestStudioFlow || guestPreJoinStep === 'prejoin');

  const stopPreJoinPreview = useCallback(() => {
    if (preJoinStreamRef.current) {
      preJoinStreamRef.current.getTracks().forEach((track) => track.stop());
      preJoinStreamRef.current = null;
    }
    setPreJoinPreviewStream(null);
  }, []);

  const enumerateDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const allDevices = await navigator.mediaDevices.enumerateDevices();

    const cameras: DeviceOption[] = [];
    const microphones: DeviceOption[] = [];
    const speakers: DeviceOption[] = [];

    allDevices.forEach((device) => {
      if (device.kind === 'videoinput') {
        cameras.push({
          id: device.deviceId,
          label: device.label || `Camera ${cameras.length + 1}`,
        });
      } else if (device.kind === 'audioinput') {
        microphones.push({
          id: device.deviceId,
          label: device.label || `Microphone ${microphones.length + 1}`,
        });
      } else if (device.kind === 'audiooutput') {
        speakers.push({
          id: device.deviceId,
          label: device.label || `Speaker ${speakers.length + 1}`,
        });
      }
    });

    setCameraDevices(cameras);
    setMicDevices(microphones);
    setSpeakerDevices(speakers);
    setSelectedCameraId((prev) => prev || cameras[0]?.id || '');
    setSelectedMicId((prev) => prev || microphones[0]?.id || '');
    setSelectedSpeakerId((prev) => prev || speakers[0]?.id || '');
  }, []);

  const startPreJoinPreview = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPreJoinStatus('error');
      setPreJoinError('Camera and microphone are not supported in this browser.');
      return;
    }

    setPreJoinError(null);
    setPreJoinStatus('starting');
    stopPreJoinPreview();

    try {
      const constraints: MediaStreamConstraints = {
        video: selectedCameraId ? { deviceId: { exact: selectedCameraId } } : true,
        audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      preJoinStreamRef.current = stream;
      setPreJoinPreviewStream(stream);
      setPreJoinMicEnabled(stream.getAudioTracks().some((track) => track.enabled));
      setPreJoinCamEnabled(stream.getVideoTracks().some((track) => track.enabled));
      setPreJoinStatus('ready');
      await enumerateDevices();
    } catch (err: any) {
      setPreJoinStatus('error');
      setPreJoinError(err?.message ?? 'Could not start camera/microphone preview.');
    }
  }, [enumerateDevices, selectedCameraId, selectedMicId, stopPreJoinPreview]);

  useEffect(() => {
    if (sessionMode === 'studio' && showPreJoin && !shouldRunStudioPreJoinChecks) {
      stopPreJoinPreview();
      return;
    }
    if (!showPreJoin) {
      if (sessionMode !== 'meet') {
        stopPreJoinPreview();
      }
      return;
    }

    startPreJoinPreview();
    return () => {
      stopPreJoinPreview();
    };
  }, [
    sessionMode,
    shouldRunStudioPreJoinChecks,
    showPreJoin,
    startPreJoinPreview,
    stopPreJoinPreview,
  ]);

  useEffect(() => {
    const element = preJoinVideoRef.current;
    if (!element) return;

    element.srcObject = preJoinPreviewStream;
    if (preJoinPreviewStream) {
      element.play?.().catch(() => {});
    }
  }, [preJoinPreviewStream]);

  function togglePreJoinMic() {
    const stream = preJoinStreamRef.current;
    if (!stream) return;
    const next = !preJoinMicEnabled;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
    setPreJoinMicEnabled(next);
  }

  function togglePreJoinCam() {
    const stream = preJoinStreamRef.current;
    if (!stream) return;
    const next = !preJoinCamEnabled;
    stream.getVideoTracks().forEach((track) => {
      track.enabled = next;
    });
    setPreJoinCamEnabled(next);
  }

  async function livekitJoin(): Promise<boolean> {
    if (livekitStatus === 'connecting' || livekitStatus === 'connected') return true;
    setLivekitError(null);
    setLivekitStatus('connecting');

    try {
      const { token, wsUrl } = await LiveKitAPI.getToken(recordingId);

      const newRoom = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      newRoom.on(RoomEvent.Connected, () => {
        setLivekitStatus('connected');
      });
      newRoom.on(RoomEvent.Reconnecting, () => setLivekitStatus('reconnecting'));
      newRoom.on(RoomEvent.Reconnected, () => setLivekitStatus('connected'));
      newRoom.on(RoomEvent.Disconnected, () => {
        setLivekitStatus('idle');
        setRemoteParticipants([]);
        setIsMicEnabled(false);
        setIsCameraEnabled(false);
        setIsScreenSharing(false);
        setRoom(null);
        roomRef.current = null;
      });

      const refresh = () => syncParticipants(newRoom);
      newRoom.on(RoomEvent.ParticipantConnected, refresh);
      newRoom.on(RoomEvent.ParticipantDisconnected, refresh);
      newRoom.on(RoomEvent.TrackPublished, refresh);
      newRoom.on(RoomEvent.TrackUnpublished, refresh);
      newRoom.on(RoomEvent.TrackSubscribed, refresh);
      newRoom.on(RoomEvent.TrackUnsubscribed, refresh);
      newRoom.on(RoomEvent.TrackMuted, refresh);
      newRoom.on(RoomEvent.TrackUnmuted, refresh);

      await newRoom.connect(wsUrl, token);
      await newRoom.localParticipant.enableCameraAndMicrophone();

      roomRef.current = newRoom;
      setRoom(newRoom);
      setIsMicEnabled(true);
      setIsCameraEnabled(true);
      syncParticipants(newRoom);
      return true;
    } catch (err: any) {
      cleanupLiveKitRoom(roomRef.current);
      roomRef.current = null;
      setRoom(null);
      setLivekitStatus('error');
      setLivekitError(err?.message ?? 'Failed to join the LiveKit room.');
      return false;
    }
  }

  function livekitLeave() {
    cleanupLiveKitRoom(roomRef.current);
    roomRef.current = null;
    setRoom(null);
    setRemoteParticipants([]);
    setIsMicEnabled(false);
    setIsCameraEnabled(false);
    setIsScreenSharing(false);
    setLivekitStatus('idle');
  }

  async function livekitToggleMic() {
    const r = roomRef.current;
    if (!r) return;
    const next = !isMicEnabled;
    try {
      await r.localParticipant.setMicrophoneEnabled(next);
      setIsMicEnabled(next);
    } catch (err: any) {
      setLivekitError(err?.message ?? 'Failed to toggle microphone.');
    }
  }

  async function livekitToggleCamera() {
    const r = roomRef.current;
    if (!r) return;
    const next = !isCameraEnabled;
    try {
      await r.localParticipant.setCameraEnabled(next);
      setIsCameraEnabled(next);
    } catch (err: any) {
      setLivekitError(err?.message ?? 'Failed to toggle camera.');
    }
  }

  async function livekitToggleScreenShare() {
    const r = roomRef.current;
    if (!r) return;
    const next = !isScreenSharing;
    try {
      await r.localParticipant.setScreenShareEnabled(next);
      setIsScreenSharing(next);
    } catch (err: any) {
      setLivekitError(err?.message ?? 'Failed to toggle screen share.');
    }
  }

  const livekitTiles = useMemo<Tile[]>(() => {
    return remoteParticipants.flatMap((p) => {
      const label = p.name || p.identity || 'Guest';
      const micPublication = p.getTrackPublication(Track.Source.Microphone);
      const micTrack = micPublication?.track ?? null;
      const micOff = !micTrack || !!micPublication?.isMuted;
      const screenAudio = getTrack(p, Track.Source.ScreenShareAudio);
      const cameraTrack = getTrack(p, Track.Source.Camera);
      const screenTrack = getTrack(p, Track.Source.ScreenShare);

      const tiles: Tile[] = [];
      if (screenTrack) {
        tiles.push({
          key: `${p.sid}-screen`,
          label,
          badge: 'Screen',
          video: livekitSource(screenTrack),
          audio: screenAudio || micTrack ? livekitSource(screenAudio || micTrack) : undefined,
          micOff,
        });
      }
      if (cameraTrack) {
        tiles.push({
          key: `${p.sid}-camera`,
          label,
          badge: 'Camera',
          video: livekitSource(cameraTrack),
          audio: micTrack ? livekitSource(micTrack) : undefined,
          micOff,
        });
      }
      if (!cameraTrack && !screenTrack) {
        tiles.push({
          key: `${p.sid}-audio`,
          label,
          badge: 'Audio only',
          video: livekitSource(null),
          audio: micTrack ? livekitSource(micTrack) : undefined,
          micOff,
        });
      }

      return tiles;
    });
  }, [remoteParticipants]);

  const livekitPeers = useMemo(
    () =>
      remoteParticipants.map((p) => ({
        id: p.sid,
        label: p.name || p.identity || 'Guest',
      })),
    [remoteParticipants]
  );

  // ===== Mesh state =====
  const mesh = useMeshRoom({
    roomId: recordingId,
    maxPeers: meshMaxPeers,
    role: requestedStudioRole ?? 'host',
  });

  const meshTiles = useMemo<Tile[]>(() => {
    return mesh.remotePeers.flatMap((peer) => {
      const shortId = peer.peerId.slice(0, 6);
      const label = `${peer.role === 'host' ? 'Host' : 'Guest'} · ${shortId}`;
      const micStream = peer.cameraStream;
      const hasAudio = micStream?.getAudioTracks().length;
      const audioSource: MediaSource | undefined = hasAudio
        ? mediaSource(micStream ?? null)
        : undefined;
      const tiles: Tile[] = [];

      if (peer.screenStream) {
        tiles.push({
          key: `${peer.peerId}-screen`,
          label,
          badge: 'Screen',
          video: mediaSource(peer.screenStream),
          audio: audioSource,
        });
      }

      if (peer.cameraStream) {
        const hasVideo = peer.cameraStream.getVideoTracks().length > 0;
        if (hasVideo) {
          tiles.push({
            key: `${peer.peerId}-camera`,
            label,
            badge: 'Camera',
            video: mediaSource(peer.cameraStream),
            audio: audioSource,
          });
        } else if (audioSource) {
          tiles.push({
            key: `${peer.peerId}-audio`,
            label,
            badge: 'Audio only',
            video: mediaSource(null),
            audio: audioSource,
          });
        }
      }

      return tiles;
    });
  }, [mesh.remotePeers]);

  const meshPeers = useMemo(
    () =>
      mesh.remotePeers.map((peer) => ({
        id: peer.peerId,
        label: `${peer.role === 'host' ? 'Host' : 'Guest'} · ${peer.peerId.slice(0, 6)}`,
      })),
    [mesh.remotePeers]
  );

  const livekitCameraStream = useMemo(
    () => livekitTrackToStream(localCameraTrack),
    [localCameraTrack]
  );
  const livekitMicStream = useMemo(
    () => livekitTrackToStream(localMicTrack),
    [localMicTrack]
  );
  const livekitScreenStream = useMemo(
    () => livekitTrackToStream(localScreenTrack),
    [localScreenTrack]
  );

  const meshCameraStream = useMemo(
    () => selectTracksAsStream(mesh.localStream, 'video'),
    [mesh.localStream]
  );
  const meshMicStream = useMemo(
    () => selectTracksAsStream(mesh.localStream, 'audio'),
    [mesh.localStream]
  );
  const meshScreenStream = useMemo(
    () => mesh.localScreenStream ?? null,
    [mesh.localScreenStream]
  );

  const recordingStreams = useMemo<Record<RecorderKind, MediaStream | null>>(
    () =>
      engine === 'livekit'
        ? {
            video: livekitCameraStream,
            audio: livekitMicStream,
            screen: livekitScreenStream,
          }
        : {
            video: meshCameraStream,
            audio: meshMicStream,
            screen: meshScreenStream,
          },
    [
      engine,
      livekitCameraStream,
      livekitMicStream,
      livekitScreenStream,
      meshCameraStream,
      meshMicStream,
      meshScreenStream,
    ]
  );

  const ensureLocalHostParticipantId = useCallback(async () => {
    if (sessionMode !== 'studio' || requestedStudioRole === 'guest') return null;
    if (recordingSession?.hostParticipantId) {
      setLocalHostParticipantId(recordingSession.hostParticipantId);
      return recordingSession.hostParticipantId;
    }
    if (localHostParticipantId) return localHostParticipantId;
    if (hostParticipantEnsureRef.current) {
      return hostParticipantEnsureRef.current;
    }

    const resolvePromise = (async () => {
      const listed = await ParticipantsAPI.list(recordingId);
      const existingHost = listed.participants.find((participant) => participant.role === 'host');
      if (existingHost) {
        setLocalHostParticipantId(existingHost.id);
        return existingHost.id;
      }

      const created = await ParticipantsAPI.create(recordingId, {
        role: 'host',
        displayName: displayName?.trim() || profile?.name?.trim() || 'Host',
      });
      setLocalHostParticipantId(created.participant.id);
      setCreatedInviteParticipantIdByRole((prev) => ({
        ...prev,
        host: prev.host ?? created.participant.id,
      }));
      return created.participant.id;
    })();

    hostParticipantEnsureRef.current = resolvePromise;
    try {
      return await resolvePromise;
    } finally {
      if (hostParticipantEnsureRef.current === resolvePromise) {
        hostParticipantEnsureRef.current = null;
      }
    }
  }, [
    displayName,
    localHostParticipantId,
    profile?.name,
    recordingId,
    recordingSession?.hostParticipantId,
    requestedStudioRole,
    sessionMode,
  ]);

  useEffect(() => {
    if (sessionMode !== 'studio' || requestedStudioRole === 'guest') return;
    if (recordingSession?.hostParticipantId) {
      setLocalHostParticipantId(recordingSession.hostParticipantId);
      return;
    }
    void ensureLocalHostParticipantId().catch((err) => {
      setSessionError((err as Error)?.message ?? 'Failed to resolve host participant.');
    });
  }, [
    ensureLocalHostParticipantId,
    recordingSession?.hostParticipantId,
    requestedStudioRole,
    sessionMode,
  ]);

  const effectiveRequestedParticipantId =
    requestedStudioRole === 'guest' && requestedGuestToken
      ? claimedGuestParticipantId ?? requestedParticipantId
      : requestedParticipantId;

  const recorderParticipantId =
    requestedStudioRole === 'guest'
      ? effectiveRequestedParticipantId
      : recordingSession?.hostParticipantId ??
        localHostParticipantId ??
        createdInviteParticipantIdByRole.host ??
        null;

  useEffect(() => {
    if (sessionMode !== 'studio' || !isRecording) return;
    if (requestedStudioRole === 'guest' && !guestClaimReady) return;
    if (!recorderParticipantId) return;

    const kinds = Object.keys(recordingStreams) as RecorderKind[];

    kinds.forEach((kind) => {
      const stream = recordingStreams[kind];
      if (!stream) return;
      if (trackIdByKind[kind]) return;
      if (registeringKindsRef.current.has(kind)) return;

      registeringKindsRef.current.add(kind);
      void RecordingsAPI.registerTrack(recordingId, {
        participantId: recorderParticipantId,
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
    guestClaimReady,
    isRecording,
    recorderParticipantId,
    recordingId,
    recordingStreams,
    requestedStudioRole,
    sessionMode,
    trackIdByKind,
  ]);

  const rollingRecorderSources = useMemo<RollingRecorderSource[]>(() => {
    const kinds: RecorderKind[] = ['audio', 'video', 'screen'];
    const sources: RollingRecorderSource[] = [];

    kinds.forEach((kind) => {
      const stream = recordingStreams[kind];
      const trackId = trackIdByKind[kind];
      if (!stream || !trackId) return;
      sources.push({
        kind,
        trackId,
        stream,
      });
    });

    return sources;
  }, [recordingStreams, trackIdByKind]);

  const recoverTrackChunkState = useCallback(
    async (trackId: string) => {
      if (!trackId || recoveringTrackIdsRef.current.has(trackId)) return;
      recoveringTrackIdsRef.current.add(trackId);

      try {
        const response = await RecordingsAPI.getTrackChunkRecovery(recordingId, trackId);
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

        await chunkUploadQueue.reconcileTrackRecovery({
          recordingId,
          trackId,
          highestExistingSeq,
          highestContiguousUploadedSeq,
          resumableTus: response.recovery.resumableTus,
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
    [chunkUploadQueue, recordingId]
  );

  useEffect(() => {
    if (sessionMode !== 'studio' || !isRecording) return;

    const trackIds = Array.from(new Set(rollingRecorderSources.map((source) => source.trackId)));
    trackIds.forEach((trackId) => {
      if (recoveryReadyByTrack[trackId]) return;
      void recoverTrackChunkState(trackId);
    });
  }, [isRecording, recoverTrackChunkState, recoveryReadyByTrack, rollingRecorderSources, sessionMode]);

  useEffect(() => {
    if (sessionMode !== 'studio') return;
    const onOnline = () => {
      if (!isRecording) return;
      const trackIds = Array.from(new Set(rollingRecorderSources.map((source) => source.trackId)));
      trackIds.forEach((trackId) => {
        void recoverTrackChunkState(trackId);
      });
    };
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
    };
  }, [isRecording, recoverTrackChunkState, rollingRecorderSources, sessionMode]);

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

      void chunkUploadQueue
        .enqueue({
          recordingId,
          trackId: chunk.trackId,
          seq: chunk.seq,
          kind: chunk.kind,
          protocol: chunkUploadProtocol,
          blob: chunk.blob,
          bytes: chunk.bytes,
          emittedAt: chunk.emittedAt,
        })
        .catch((err) => {
          setRecorderError((err as Error)?.message ?? 'Failed to enqueue chunk upload.');
        });
    },
    [chunkUploadProtocol, chunkUploadQueue, recordingId]
  );

  const finalizeTrackCaptures = useCallback(async () => {
    if (sessionMode !== 'studio') return;
    const trackIds = Array.from(
      new Set(Object.values(trackIdByKind).filter((value): value is string => !!value))
    );
    if (trackIds.length === 0) return;

    const captureClosedAt = new Date().toISOString();
    await Promise.all(
      trackIds.map(async (trackId) => {
        const observedFinalSeq = latestChunkSeqByTrackRef.current.get(trackId) ?? 0;
        const recoveredNextSeq = recoveredNextSeqByTrack[trackId];
        const recoveredFinalSeq =
          typeof recoveredNextSeq === 'number' && Number.isFinite(recoveredNextSeq)
            ? Math.max(0, Math.floor(recoveredNextSeq) - 1)
            : 0;
        const finalSeq = Math.max(observedFinalSeq, recoveredFinalSeq);
        await RecordingsAPI.finalizeTrack(recordingId, trackId, {
          finalSeq,
          captureClosedAt,
        });
      })
    );
  }, [recordingId, recoveredNextSeqByTrack, sessionMode, trackIdByKind]);

  useRollingChunkRecorder({
    enabled:
      sessionMode === 'studio' &&
      isRecording &&
      !!recorderParticipantId &&
      recoveredRollingRecorderSources.length > 0,
    timesliceMs: 4000,
    sources: recoveredRollingRecorderSources,
    initialNextSeqByTrack: recoveredNextSeqByTrack,
    onChunk: onChunkEmitted,
    onError: setRecorderError,
  });

  const active = engine === 'livekit'
    ? {
        status: livekitStatus,
        error: livekitError,
        isMicEnabled,
        isCameraEnabled,
        isScreenSharing,
        localVideo: livekitSource(localCameraTrack),
        localScreen: livekitSource(localScreenTrack),
        tiles: livekitTiles,
        peers: livekitPeers,
        join: livekitJoin,
        leave: livekitLeave,
        toggleMic: livekitToggleMic,
        toggleCamera: livekitToggleCamera,
        toggleScreen: livekitToggleScreenShare,
      }
    : {
        status: mesh.status as ConnectionStatus,
        error: mesh.error,
        isMicEnabled: !mesh.isMicMuted,
        isCameraEnabled: !mesh.isCameraOff,
        isScreenSharing: mesh.isScreenSharing,
        localVideo: mediaSource(mesh.localStream),
        localScreen: mediaSource(mesh.localScreenStream),
        tiles: meshTiles,
        peers: meshPeers,
        join: async () => {
          await mesh.join();
          return true;
        },
        leave: mesh.leave,
        toggleMic: mesh.toggleMic,
        toggleCamera: mesh.toggleCamera,
        toggleScreen: mesh.isScreenSharing ? mesh.stopScreenShare : mesh.startScreenShare,
      };

  const isConnected = active.status === 'connected' || active.status === 'reconnecting';

  useEffect(() => {
    if (sessionMode !== 'meet') return;
    if (isConnected) return;
    if (preJoinPreviewStream) return;
    startPreJoinPreview();
  }, [isConnected, preJoinPreviewStream, sessionMode, startPreJoinPreview]);

  useEffect(() => {
    if (sessionMode !== 'meet') return;
    if (!isConnected) return;
    if (!preJoinPreviewStream) return;
    stopPreJoinPreview();
  }, [isConnected, preJoinPreviewStream, sessionMode, stopPreJoinPreview]);

  useEffect(() => {
    if (!pinnedTileKey) return;
    const isRemotePinValid = active.tiles.some((tile) => tile.key === pinnedTileKey);
    const isStudioLocalPin =
      sessionMode === 'studio' &&
      (pinnedTileKey === 'studio-local-camera' || pinnedTileKey === 'studio-local-screen');
    const isMeetLocalPin =
      sessionMode === 'meet' &&
      (pinnedTileKey === 'meet-local-camera' || pinnedTileKey === 'meet-local-screen');
    if (!isRemotePinValid && !isMeetLocalPin && !isStudioLocalPin) {
      setPinnedTileKey(null);
    }
  }, [active.tiles, pinnedTileKey, sessionMode]);

  const hasLocalPublishedVideo = active.localVideo.kind === 'livekit'
    ? !!active.localVideo.track
    : !!active.localVideo.stream;

  const meetLocalTile = useMemo<Tile>(
    () => ({
      key: 'meet-local-camera',
      label: displayName || 'You',
      badge: 'You',
      video: hasLocalPublishedVideo ? active.localVideo : mediaSource(preJoinPreviewStream),
      muted: true,
    }),
    [active.localVideo, displayName, hasLocalPublishedVideo, preJoinPreviewStream]
  );

  const hasLocalScreenTrack = active.localScreen.kind === 'livekit'
    ? !!active.localScreen.track
    : !!active.localScreen.stream;

  const meetLocalScreenTile = useMemo<Tile | null>(
    () =>
      hasLocalScreenTrack
        ? {
            key: 'meet-local-screen',
            label: displayName || 'You',
            badge: 'Screen',
            video: active.localScreen,
            muted: true,
          }
        : null,
    [active.localScreen, displayName, hasLocalScreenTrack]
  );

  const meetAllTiles = useMemo<Tile[]>(
    () => [meetLocalTile, ...(meetLocalScreenTile ? [meetLocalScreenTile] : []), ...active.tiles],
    [active.tiles, meetLocalScreenTile, meetLocalTile]
  );

  const defaultMeetMainTile = useMemo<Tile>(() => {
    const screenTile = meetAllTiles.find((tile) => tile.badge === 'Screen');
    return screenTile ?? active.tiles[0] ?? meetLocalTile;
  }, [active.tiles, meetAllTiles, meetLocalTile]);

  const meetMainTile = useMemo<Tile>(() => {
    if (pinnedTileKey) {
      const pinned = meetAllTiles.find((tile) => tile.key === pinnedTileKey);
      if (pinned) return pinned;
    }
    return defaultMeetMainTile;
  }, [defaultMeetMainTile, meetAllTiles, pinnedTileKey]);

  const hasRemoteStage = active.tiles.length > 0;
  const meetSecondaryTiles = useMemo<Tile[]>(
    () => meetAllTiles.filter((tile) => tile.key !== meetMainTile.key),
    [meetAllTiles, meetMainTile.key]
  );

  const meetVisibleSecondaryTiles = useMemo<Tile[]>(
    () =>
      meetSecondaryTiles.filter(
        (tile) => showMeetSelfPreview || tile.key !== meetLocalTile.key
      ),
    [meetLocalTile.key, meetSecondaryTiles, showMeetSelfPreview]
  );

  const meetPeople = useMemo(
    () => {
      const remotePrimaryTile = new Map<string, string>();
      active.tiles.forEach((tile) => {
        if (!remotePrimaryTile.has(tile.label)) {
          remotePrimaryTile.set(tile.label, tile.key);
        }
      });

      return [
        {
          id: 'local',
          label: displayName || 'You',
          role: 'You',
          tileKey: meetLocalTile.key,
        },
        ...active.peers.map((peer) => ({
          id: peer.id,
          label: peer.label,
          role: 'Guest',
          tileKey: remotePrimaryTile.get(peer.label) ?? null,
        })),
      ];
    },
    [active.peers, active.tiles, displayName, meetLocalTile.key]
  );

  async function handleJoin(): Promise<boolean> {
    if (sessionMode === 'meet') {
      stopPreJoinPreview();
    }

    if (engine === 'livekit') {
      const ok = await livekitJoin();
      if (!ok) {
        setFallbackNotice('LiveKit connection failed. Switching to mesh fallback.');
        setEngine('mesh');
        try {
          await mesh.join();
          return true;
        } catch {
          if (sessionMode === 'meet') {
            startPreJoinPreview();
          }
          return false;
        }
      }
      return true;
    }
    try {
      await mesh.join();
      return true;
    } catch {
      if (sessionMode === 'meet') {
        startPreJoinPreview();
      }
      return false;
    }
  }

  async function handleJoinFromPreJoin() {
    setGuestJoinError(null);
    setJoiningFromPreJoin(true);
    try {
      if (isGuestStudioFlow) {
        const trimmedDisplayName = displayName.trim();
        if (!requestedGuestToken) {
          setGuestClaimReady(false);
          setGuestJoinError('Guest invite token is missing. Ask host for a fresh invite link.');
          return;
        }
        if (!trimmedDisplayName) {
          setGuestClaimReady(false);
          setGuestJoinError('Name is required to join as a guest.');
          return;
        }

        const normalizedEmail = guestEmail.trim();
        const result = await ParticipantsAPI.bootstrapGuest({
          token: requestedGuestToken,
          displayName: trimmedDisplayName,
          ...(normalizedEmail ? { email: normalizedEmail } : {}),
        });
        setDisplayName(result.participant.displayName?.trim() || trimmedDisplayName);
        setClaimedGuestParticipantId(result.participant.id);
        setGuestClaimReady(true);
      }

      const ok = await handleJoin();
      if (ok) {
        stopPreJoinPreview();
        setShowPreJoin(false);
      }
    } catch (err) {
      const guestJoinErr = err as Error & { code?: string; status?: number };
      const code = String(guestJoinErr.code ?? '');
      const status = Number(guestJoinErr.status ?? 0);
      if (code === 'invalid_token' || status === 401) {
        setGuestJoinError('Guest invite token is invalid or expired. Ask host for a fresh invite link.');
      } else if (code === 'invalid_display_name') {
        setGuestJoinError('Name is required to join as a guest.');
      } else {
        setGuestJoinError(guestJoinErr.message ?? 'Failed to join the studio as guest.');
      }
      if (isGuestStudioFlow) {
        setGuestClaimReady(false);
      }
    } finally {
      setJoiningFromPreJoin(false);
    }
  }

  function handleGuestWelcomeContinue() {
    setGuestJoinError(null);
    setGuestPreJoinStep('prejoin');
  }

  async function handleLeave() {
    if (sessionMode === 'studio' && canControlRecording && isRecording && !sessionBusy) {
      setSessionBusy(true);
      setSessionError(null);
      try {
        const response = await RecordingsAPI.stopSession(recordingId);
        setRecordingSession(response.session);
        setCanControlRecording(response.canControl);
        await new Promise((resolve) => window.setTimeout(resolve, 250));
        await finalizeTrackCaptures();
      } catch (err) {
        setSessionError((err as Error)?.message ?? 'Failed to stop recording session before leaving.');
      } finally {
        setSessionBusy(false);
      }
    }

    setPinnedTileKey(null);
    active.leave();
    setEngine('livekit');
    setFallbackNotice(null);
    if (sessionMode === 'studio') {
      setShowPreJoin(true);
    }
  }

  async function handleToggleRecordingSession() {
    if (!canControlRecording || sessionBusy) return;

    setSessionBusy(true);
    setSessionError(null);
    try {
      const wasRecording = isRecording;
      if (!wasRecording) {
        const hostId = await ensureLocalHostParticipantId();
        if (!hostId) {
          throw new Error('Host participant is required before recording can start.');
        }
      }
      const response = isRecording
        ? await RecordingsAPI.stopSession(recordingId)
        : await RecordingsAPI.startSession(recordingId);

      setRecordingSession(response.session);
      setCanControlRecording(response.canControl);
      if (wasRecording) {
        await new Promise((resolve) => window.setTimeout(resolve, 250));
        await finalizeTrackCaptures();
      }
    } catch (err) {
      setSessionError((err as Error)?.message ?? 'Failed to update recording session.');
    } finally {
      setSessionBusy(false);
    }
  }

  function togglePin(tileKey: string) {
    setPinnedTileKey((prev) => (prev === tileKey ? null : tileKey));
  }

  function openMeetContextMenu(
    event: React.MouseEvent<HTMLElement>,
    tileKey: string,
    isMain: boolean
  ) {
    event.preventDefault();
    setMeetContextMenu({
      x: event.clientX,
      y: event.clientY,
      tileKey,
      isMain,
    });
  }

  function closeMeetContextMenu() {
    setMeetContextMenu(null);
  }

  async function toggleMeetFullscreen() {
    const stageElement = meetStageRef.current;
    if (!stageElement) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await stageElement.requestFullscreen();
      }
    } catch {
      // ignore fullscreen errors
    }
  }

  useEffect(() => {
    if (!meetContextMenu) return;

    const onPointerDown = () => setMeetContextMenu(null);
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMeetContextMenu(null);
      }
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onEsc);
    };
  }, [meetContextMenu]);

  useEffect(() => {
    if (!showMeetViewMenu) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-meet-view-menu-root]')) return;
      setShowMeetViewMenu(false);
    };

    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [showMeetViewMenu]);

  useEffect(() => {
    if (sessionMode === 'studio' && !showPreJoin && active.status === 'idle') {
      setShowPreJoin(true);
    }
  }, [active.status, sessionMode, showPreJoin]);

  useEffect(() => {
    if (sessionMode === 'studio' && isRecording) {
      setShowStudioInvitePanel(false);
    }
  }, [isRecording, sessionMode]);

  const progressParticipants = useMemo(
    () => {
      const participants = recordingProgress?.participants ?? [];
      const sessionStartedAtMs = recordingSession?.startedAt
        ? new Date(recordingSession.startedAt).getTime()
        : null;

      return participants.filter((participant) => {
        if (participant.participantId === recorderParticipantId) return true;
        if (effectiveRequestedParticipantId && participant.participantId === effectiveRequestedParticipantId) return true;
        if (participant.pendingCount > 0) return true;
        if (participant.trackCount <= 0 && participant.uploadedCount <= 0) return false;
        if (!sessionStartedAtMs) return true;

        return participant.tracks.some((track) => {
          if (!track.updatedAt) return true;
          const updatedMs = new Date(track.updatedAt).getTime();
          return Number.isFinite(updatedMs) && updatedMs >= sessionStartedAtMs;
        });
      });
    },
    [
      recorderParticipantId,
      recordingProgress?.participants,
      recordingSession?.startedAt,
      effectiveRequestedParticipantId,
    ]
  );

  useEffect(() => {
    if (sessionMode !== 'studio') return;
    if (requestedStudioRole !== 'guest') return;
    if (!recordingSession?.stoppedAt) return;
    const hasLocalPendingUploads =
      chunkUploadQueue.stats.pending > 0 || chunkUploadQueue.stats.processing > 0;
    const hasBackendPendingUploads = progressParticipants.some((participant) => participant.pendingCount > 0);
    if (!hasLocalPendingUploads && !hasBackendPendingUploads) return;
    setShowUploadStatusModal(true);
  }, [
    chunkUploadQueue.stats.pending,
    chunkUploadQueue.stats.processing,
    progressParticipants,
    requestedStudioRole,
    recordingSession?.stoppedAt,
    sessionMode,
  ]);

  useEffect(() => {
    if (sessionMode === 'studio' && requestedStudioRole === 'guest') {
      setShowStudioInvitePanel(false);
      if (requestedGuestToken && !guestClaimReady) return;
      if (!effectiveRequestedParticipantId) {
        setSessionError('Guest invite link is missing participant context. Ask host for a fresh invite link.');
      }
    }
  }, [
    effectiveRequestedParticipantId,
    guestClaimReady,
    requestedGuestToken,
    requestedStudioRole,
    sessionMode,
  ]);

  const inviteLink =
    typeof window !== 'undefined'
      ? buildStudioInviteLink({
          origin: window.location.origin,
          recordingId,
          role: inviteRole,
          participantId: createdInviteParticipantIdByRole[inviteRole] ?? null,
          guestToken: inviteRole === 'guest' ? createdInviteGuestToken : null,
        })
      : '';

  const localStudioRole: 'host' | 'guest' = canControlRecording ? 'host' : 'guest';
  const localStudioRoleLabel = localStudioRole === 'host' ? 'Host' : 'Guest';
  const localParticipantProgress = progressParticipants.find((participant) =>
    recorderParticipantId
      ? participant.participantId === recorderParticipantId
      : effectiveRequestedParticipantId
        ? participant.participantId === effectiveRequestedParticipantId
        : participant.role === 'host'
  );
  const localUploadComplete = localParticipantProgress
    ? localParticipantProgress.pendingCount === 0
    : chunkUploadQueue.stats.pending + chunkUploadQueue.stats.processing === 0;
  const uploadCompletion = useMemo(() => {
    const participantsWithUploads = progressParticipants.filter(
      (participant) =>
        participant.trackCount > 0 || participant.uploadedCount > 0 || participant.pendingCount > 0
    );
    const participantsTotal = participantsWithUploads.length;
    const participantsCompleted = participantsWithUploads.filter(
      (participant) => participant.trackCount > 0 && participant.pendingCount === 0
    ).length;
    const tracksTotal = participantsWithUploads.reduce(
      (sum, participant) => sum + participant.trackCount,
      0
    );
    const tracksUploaded = participantsWithUploads.reduce(
      (sum, participant) => sum + participant.uploadedCount,
      0
    );

    const fallbackChunkTotal = participantsWithUploads.reduce(
      (sum, participant) =>
        sum + participant.tracks.reduce((trackSum, track) => trackSum + track.chunkTotal, 0),
      0
    );
    const fallbackChunkUploaded = participantsWithUploads.reduce(
      (sum, participant) =>
        sum + participant.tracks.reduce((trackSum, track) => trackSum + track.chunkUploaded, 0),
      0
    );
    const chunksTotal =
      recordingProgress?.summary.chunksTotal && recordingProgress.summary.chunksTotal > 0
        ? recordingProgress.summary.chunksTotal
        : fallbackChunkTotal;
    const chunksUploaded =
      recordingProgress?.summary.chunksUploaded && recordingProgress.summary.chunksUploaded > 0
        ? recordingProgress.summary.chunksUploaded
        : fallbackChunkUploaded;

    const hasBackendPendingUploads = participantsWithUploads.some(
      (participant) => participant.pendingCount > 0
    );
    const hasLocalPendingUploads =
      chunkUploadQueue.stats.pending > 0 || chunkUploadQueue.stats.processing > 0;
    const hasPendingUploads = hasLocalPendingUploads || hasBackendPendingUploads;
    const hasTrackEvidence =
      tracksTotal > 0 ||
      tracksUploaded > 0 ||
      chunksUploaded > 0 ||
      chunkUploadQueue.stats.completed > 0 ||
      chunkUploadQueue.stats.bytesUploaded > 0;
    const allParticipantTracksUploaded =
      tracksTotal > 0 && tracksUploaded >= tracksTotal && participantsTotal > 0;
    const uploadsComplete =
      !!recordingSession?.stoppedAt &&
      hasTrackEvidence &&
      allParticipantTracksUploaded &&
      !hasPendingUploads;

    return {
      participantsTotal,
      participantsCompleted,
      tracksTotal,
      tracksUploaded,
      chunksTotal,
      chunksUploaded,
      hasPendingUploads,
      hasTrackEvidence,
      uploadsComplete,
    };
  }, [
    chunkUploadQueue.stats.bytesUploaded,
    chunkUploadQueue.stats.completed,
    chunkUploadQueue.stats.pending,
    chunkUploadQueue.stats.processing,
    progressParticipants,
    recordingProgress?.summary.chunksTotal,
    recordingProgress?.summary.chunksUploaded,
    recordingSession?.stoppedAt,
  ]);
  const hasPendingUploads = uploadCompletion.hasPendingUploads;
  const canOpenProject = uploadCompletion.uploadsComplete;
  const hostStudioLifecyclePhase = useMemo<HostStudioLifecyclePhase | null>(() => {
    if (sessionMode !== 'studio' || showPreJoin || localStudioRole !== 'host') return null;
    if (isRecording) {
      return sessionBusy ? 'stopping' : 'recording';
    }
    if (!recordingSession?.stoppedAt) {
      return sessionBusy ? 'stopping' : 'recording';
    }
    if (hasPendingUploads || !uploadCompletion.hasTrackEvidence || !uploadCompletion.uploadsComplete) {
      return 'uploading';
    }
    if (recordingProgress?.phase === 'processing' || recordingProgress?.phase === 'ready') {
      return 'processing_handoff';
    }
    return 'upload_complete';
  }, [
    hasPendingUploads,
    isRecording,
    localStudioRole,
    uploadCompletion.hasTrackEvidence,
    uploadCompletion.uploadsComplete,
    recordingProgress?.phase,
    recordingSession?.stoppedAt,
    sessionBusy,
    sessionMode,
    showPreJoin,
  ]);
  const hostUploadOverlayOpen =
    localStudioRole === 'host' &&
    hostStudioLifecyclePhase !== null &&
    hostStudioLifecyclePhase !== 'recording';
  const uploadOverlayOpen =
    localStudioRole === 'host'
      ? hostUploadOverlayOpen
      : showUploadStatusModal;

  useEffect(() => {
    if (sessionMode !== 'studio') return;
    if (!showUploadStatusModal) return;
    if (!recordingSession?.stoppedAt) return;
    if (!localUploadComplete) return;

    if (localStudioRole === 'guest') {
      router.replace(`/studio/${recordingId}/thanks`);
      return;
    }
  }, [
    localStudioRole,
    localUploadComplete,
    recordingId,
    recordingSession?.stoppedAt,
    router,
    sessionMode,
    showUploadStatusModal,
  ]);

  useEffect(() => {
    if (sessionMode !== 'studio') return;
    const hasWork =
      chunkUploadQueue.stats.pending + chunkUploadQueue.stats.processing > 0 ||
      hostStudioLifecyclePhase === 'stopping' ||
      hostStudioLifecyclePhase === 'uploading';
    if (!hasWork) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [
    chunkUploadQueue.stats.pending,
    chunkUploadQueue.stats.processing,
    hostStudioLifecyclePhase,
    sessionMode,
  ]);

  async function ensureInviteParticipantId(role: 'guest' | 'host') {
    const existing = createdInviteParticipantIdByRole[role];
    if (existing) {
      return {
        participantId: existing,
        guestToken: role === 'guest' ? createdInviteGuestToken ?? undefined : undefined,
      };
    }

    if (role === 'host') {
      const hostId = await ensureLocalHostParticipantId();
      if (!hostId) {
        throw new Error('Host participant is not available.');
      }
      setCreatedInviteParticipantIdByRole((prev) => ({ ...prev, host: hostId }));
      return { participantId: hostId };
    }

    const result = await ParticipantsAPI.create(recordingId, {
      role,
      displayName: `${role === 'host' ? 'Host' : 'Guest'} ${Date.now()}`,
    });
    const participantId = result.participant.id;
    const guestToken = tokenFromMagicLink(result.magicLink);
    setCreatedInviteParticipantIdByRole((prev) => ({ ...prev, [role]: participantId }));
    setCreatedInviteGuestToken(guestToken);
    return { participantId, guestToken: guestToken ?? undefined };
  }

  async function handleCopyInviteLink() {
    if (typeof window === 'undefined') return;
    try {
      const invite = await ensureInviteParticipantId(inviteRole);
      const link = buildStudioInviteLink({
        origin: window.location.origin,
        recordingId,
        role: inviteRole,
        participantId: invite.participantId,
        guestToken: inviteRole === 'guest' ? invite.guestToken ?? null : null,
      });
      await navigator.clipboard.writeText(link);
      setCopyState('copied');
      setInviteNotice(null);
    } catch {
      setCopyState('error');
      setInviteNotice('Could not create/copy invite link.');
    }
  }

  function handleInviteByEmail() {
    if (!inviteEmail.trim()) {
      setInviteNotice('Enter an email to send invite.');
      return;
    }
    setInviteNotice('Email invite API is not wired yet. Link sharing is active.');
  }

  const studioCanvasTiles = useMemo<Tile[]>(() => {
    const tiles: Tile[] = [];

    tiles.push({
      key: 'studio-local-camera',
      label: displayName || 'You',
      badge: 'Camera',
      video: active.localVideo,
      muted: true,
      micOff: !active.isMicEnabled,
    });

    if (active.localScreen.kind === 'livekit' ? !!active.localScreen.track : !!active.localScreen.stream) {
      tiles.push({
        key: 'studio-local-screen',
        label: `${displayName || 'You'} (Screen)`,
        badge: 'Screen',
        video: active.localScreen,
        muted: true,
        micOff: !active.isMicEnabled,
      });
    }

    tiles.push(...active.tiles);
    return tiles;
  }, [active.isMicEnabled, active.localScreen, active.localVideo, active.tiles, displayName]);

  if (showPreJoin && sessionMode === 'studio') {
    const isGuestWelcomeStep = isGuestStudioFlow && guestPreJoinStep === 'welcome';
    const guestNameMissing = isGuestStudioFlow && displayName.trim().length === 0;

    if (isGuestWelcomeStep) {
      return (
        <main className={`${spaceGrotesk.className} min-h-screen bg-[#090b10] text-slate-100`}>
          <div className="mx-auto flex min-h-screen w-full max-w-[980px] flex-col px-6 py-6">
            <header className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Link href="/" className="text-slate-400 hover:text-slate-100">
                  ←
                </Link>
                <p className="text-2xl font-semibold tracking-[0.2em]">RIVERSIDE</p>
              </div>
            </header>

            <section className="flex flex-1 items-center justify-center py-10">
              <div className="w-full max-w-2xl rounded-3xl border border-slate-800 bg-[#121620] p-10">
                <span className="inline-flex rounded-full border border-violet-400/40 bg-violet-500/10 px-4 py-2 text-sm text-violet-100">
                  Guest Invite
                </span>
                <h1 className="mt-5 text-5xl font-semibold leading-tight">
                  Join this recording as a guest
                </h1>
                <p className="mt-4 text-xl text-slate-300">
                  You are joining as a guest participant. No account login is required for this invite.
                </p>
                <p className="mt-2 text-base text-slate-400">
                  Continue to enter your details, run device checks, and join the studio session.
                </p>

                {!requestedGuestToken && (
                  <p className="mt-5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    Guest invite token is missing. Ask host for a fresh invite link.
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleGuestWelcomeContinue}
                  disabled={!requestedGuestToken}
                  className="mt-7 w-full rounded-xl bg-[#8b5cf6] px-4 py-3 text-xl font-semibold text-white hover:bg-[#7c4cf0] disabled:opacity-60"
                >
                  Continue as guest
                </button>
              </div>
            </section>
          </div>
        </main>
      );
    }

    return (
      <main className={`${spaceGrotesk.className} min-h-screen bg-[#090b10] text-slate-100`}>
        <div className="mx-auto flex min-h-screen w-full max-w-[1450px] flex-col px-6 py-6">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/" className="text-slate-400 hover:text-slate-100">
                ←
              </Link>
              <p className="text-2xl font-semibold tracking-[0.2em]">RIVERSIDE</p>
              <span className="text-slate-600">|</span>
              <p className="text-xl text-slate-300">{displayName || 'Host'}&apos;s Studio</p>
            </div>
            <button
              type="button"
              className="rounded-xl border border-slate-700 bg-[#161a22] px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
            >
              Get help
            </button>
          </header>

          <section className="flex flex-1 items-center py-10">
            <div className="grid w-full items-start gap-12 xl:grid-cols-[minmax(0,1fr)_420px]">
              <div className="max-w-xl space-y-6">
                <span className="inline-flex rounded-full border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
                  REC
                </span>
                <p className="text-2xl text-slate-400">
                  {isGuestStudioFlow
                    ? 'You are about to join this studio as a guest'
                    : `You're about to join ${displayName || 'your'} studio`}
                </p>
                <h1 className="text-6xl font-semibold leading-tight">Let&apos;s check your cam and mic</h1>

                <div className="space-y-3">
                  <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-[#1a1e26] px-4 py-3">
                    <input
                      type="text"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      className="min-w-0 flex-1 bg-transparent text-xl outline-none placeholder:text-slate-500"
                      placeholder={isGuestStudioFlow ? 'Your name (required)' : 'Your display name'}
                    />
                    <span className="rounded-lg bg-[#2a2f39] px-3 py-1 text-sm text-slate-200">{localStudioRoleLabel}</span>
                  </label>

                  {isGuestStudioFlow && (
                    <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-[#1a1e26] px-4 py-3">
                      <input
                        type="email"
                        value={guestEmail}
                        onChange={(event) => setGuestEmail(event.target.value)}
                        className="min-w-0 flex-1 bg-transparent text-xl outline-none placeholder:text-slate-500"
                        placeholder="Email (optional)"
                      />
                    </label>
                  )}

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setUsingHeadphones(false)}
                      className={`rounded-xl px-4 py-3 text-base ${
                        !usingHeadphones
                          ? 'bg-[#2a2f39] text-white'
                          : 'border border-slate-700 bg-[#171b22] text-slate-300'
                      }`}
                    >
                      I am not using headphones
                    </button>
                    <button
                      type="button"
                      onClick={() => setUsingHeadphones(true)}
                      className={`rounded-xl px-4 py-3 text-base ${
                        usingHeadphones
                          ? 'bg-[#2a2f39] text-white'
                          : 'border border-slate-700 bg-[#171b22] text-slate-300'
                      }`}
                    >
                      I am using headphones
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleJoinFromPreJoin}
                    disabled={preJoinStatus !== 'ready' || joiningFromPreJoin || guestNameMissing}
                    className="w-full rounded-xl bg-[#8b5cf6] px-4 py-3 text-xl font-semibold text-white hover:bg-[#7c4cf0] disabled:opacity-60"
                  >
                    {joiningFromPreJoin
                      ? 'Joining studio...'
                      : isGuestStudioFlow
                        ? 'Join as guest'
                        : 'Join studio'}
                  </button>

                  <p className="text-lg text-slate-400">
                    {isGuestStudioFlow
                      ? 'Joining as guest participant'
                      : `You are joining as a ${localStudioRole === 'host' ? 'host' : 'guest'}`}
                  </p>
                  {guestJoinError && (
                    <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                      {guestJoinError}
                    </p>
                  )}
                  {preJoinError && (
                    <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                      {preJoinError}
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-800 bg-[#151820] p-4">
                <div className="relative overflow-hidden rounded-2xl bg-black">
                  <video ref={preJoinVideoRef} autoPlay playsInline muted className="aspect-video w-full object-cover" />
                  <div className="absolute left-3 top-3 rounded-full bg-black/55 px-3 py-1 text-xs text-slate-100">
                    720p / 30fps
                  </div>
                  <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={togglePreJoinMic}
                      className={`rounded-full px-3 py-1 text-sm ${
                        preJoinMicEnabled ? 'bg-[#1f2530] text-slate-100' : 'bg-rose-500 text-white'
                      }`}
                    >
                      {preJoinMicEnabled ? 'Mic' : 'Mic off'}
                    </button>
                    <button
                      type="button"
                      onClick={togglePreJoinCam}
                      className={`rounded-full px-3 py-1 text-sm ${
                        preJoinCamEnabled ? 'bg-[#1f2530] text-slate-100' : 'bg-rose-500 text-white'
                      }`}
                    >
                      {preJoinCamEnabled ? 'Cam' : 'Cam off'}
                    </button>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  <label className="block rounded-xl border border-slate-700 bg-[#1a1f29] px-3 py-2 text-sm">
                    <span className="mb-1 block text-xs text-slate-400">Camera</span>
                    <select
                      value={selectedCameraId}
                      onChange={(event) => setSelectedCameraId(event.target.value)}
                      className="w-full bg-transparent outline-none"
                    >
                      {cameraDevices.length === 0 && <option value="">Default camera</option>}
                      {cameraDevices.map((device) => (
                        <option key={device.id} value={device.id}>
                          {device.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block rounded-xl border border-slate-700 bg-[#1a1f29] px-3 py-2 text-sm">
                    <span className="mb-1 block text-xs text-slate-400">Microphone</span>
                    <select
                      value={selectedMicId}
                      onChange={(event) => setSelectedMicId(event.target.value)}
                      className="w-full bg-transparent outline-none"
                    >
                      {micDevices.length === 0 && <option value="">Default microphone</option>}
                      {micDevices.map((device) => (
                        <option key={device.id} value={device.id}>
                          {device.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block rounded-xl border border-slate-700 bg-[#1a1f29] px-3 py-2 text-sm">
                    <span className="mb-1 block text-xs text-slate-400">Speaker</span>
                    <select
                      value={selectedSpeakerId}
                      onChange={(event) => setSelectedSpeakerId(event.target.value)}
                      className="w-full bg-transparent outline-none"
                    >
                      {speakerDevices.length === 0 && <option value="">Default speakers</option>}
                      {speakerDevices.map((device) => (
                        <option key={device.id} value={device.id}>
                          {device.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    onClick={startPreJoinPreview}
                    className="w-full rounded-xl border border-slate-700 bg-[#171b23] px-3 py-2 text-sm text-slate-200 hover:border-slate-500"
                  >
                    {preJoinStatus === 'starting' ? 'Refreshing preview...' : 'Refresh preview'}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (!showPreJoin && sessionMode === 'studio') {
    const progressPeople =
      progressParticipants.map((participant) => {
        const participantChunkTotal = participant.tracks.reduce(
          (sum, track) => sum + track.chunkTotal,
          0
        );
        const participantChunkUploaded = participant.tracks.reduce(
          (sum, track) => sum + track.chunkUploaded,
          0
        );
        const pct =
          participantChunkTotal > 0
            ? Math.round((participantChunkUploaded / participantChunkTotal) * 100)
            : participant.trackCount === 0
              ? 0
              : Math.round((participant.uploadedCount / participant.trackCount) * 100);
        return {
          id: participant.participantId,
          label: participant.displayName || participant.participantId.slice(0, 8),
          role: participant.role === 'host' ? 'Host' : 'Guest',
          percent: pct,
          note:
            participant.pendingCount > 0
              ? `${Math.max(0, 100 - pct)}% remaining`
              : 'Upload complete',
        };
      }) ?? [];
    const people =
      progressPeople.length > 0
        ? progressPeople
        : [
            {
              id: 'local',
              label: displayName || 'You',
              role: localStudioRoleLabel,
              percent: 0,
              note: isRecording ? 'Recording...' : 'Waiting for upload...',
            },
            ...active.peers.map((peer) => ({
              id: peer.id,
              label: peer.label,
              role: 'Guest',
              percent: 30,
              note: 'Connected',
            })),
          ];
    const visibleTiles = studioCanvasTiles;
    const tileCount = visibleTiles.length;
    const stageGridClass =
      tileCount >= 4
        ? 'xl:grid-cols-4 md:grid-cols-2 auto-rows-fr'
        : tileCount === 3
          ? 'xl:grid-cols-3 md:grid-cols-2 auto-rows-fr'
          : tileCount === 2
            ? 'md:grid-cols-2 auto-rows-fr'
            : 'grid-cols-1 auto-rows-fr';
    const shouldFillTiles = true;
    const tileClassName = 'h-full min-h-0 rounded-2xl border-violet-400/60 bg-black';
    const queueTotalBytes = chunkUploadQueue.stats.bytesTotal;
    const queueUploadedPercent =
      queueTotalBytes === 0
        ? 0
        : Math.min(
            100,
            Math.round(
              ((chunkUploadQueue.stats.bytesUploaded + chunkUploadQueue.stats.bytesProcessing) * 100) /
                queueTotalBytes
            )
          );
    const fallbackProgressChunkTotal = progressParticipants.reduce(
      (sum, participant) =>
        sum + participant.tracks.reduce((trackSum, track) => trackSum + track.chunkTotal, 0),
      0
    );
    const fallbackProgressChunkUploaded = progressParticipants.reduce(
      (sum, participant) =>
        sum + participant.tracks.reduce((trackSum, track) => trackSum + track.chunkUploaded, 0),
      0
    );
    const progressChunkTotal =
      recordingProgress?.summary.chunksTotal && recordingProgress.summary.chunksTotal > 0
        ? recordingProgress.summary.chunksTotal
        : fallbackProgressChunkTotal;
    const progressChunkUploaded =
      recordingProgress?.summary.chunksUploaded && recordingProgress.summary.chunksUploaded > 0
        ? recordingProgress.summary.chunksUploaded
        : fallbackProgressChunkUploaded;
    const progressUploadedPercent =
      progressChunkTotal > 0
        ? Math.min(100, Math.round((progressChunkUploaded * 100) / progressChunkTotal))
        : null;
    const uploadedPercent = Math.max(progressUploadedPercent ?? 0, queueUploadedPercent);
    const peopleForPanel =
      progressPeople.length > 0
        ? progressPeople
        : people.map((person, index) =>
            index === 0
              ? {
                  ...person,
                  percent: uploadedPercent,
                  note: `${uploadedPercent}% uploaded`,
                }
              : person
          );
    const hasLiveUploadActivity =
      chunkUploadQueue.stats.completed > 0 ||
      chunkUploadQueue.stats.processing > 0 ||
      chunkUploadQueue.stats.pending > 0 ||
      uploadedPercent > 0;
    const hostShouldShowUploadChip =
      (isRecording && hasLiveUploadActivity) ||
      (hostStudioLifecyclePhase !== null && hostStudioLifecyclePhase !== 'recording') ||
      (!!recordingSession?.stoppedAt && !canOpenProject);
    const showUploadChip =
      localStudioRole === 'host'
        ? hostShouldShowUploadChip
        : isRecording || hasPendingUploads || (!!recordingSession?.stoppedAt && !localUploadComplete);
    const uploadChipLabel =
      localStudioRole === 'host'
        ? isRecording && hasLiveUploadActivity
          ? `↑ ${uploadedPercent}% Uploading...`
          : hostStudioLifecyclePhase === 'stopping'
          ? 'Stopping...'
          : hostStudioLifecyclePhase === 'uploading'
            ? `↑ ${uploadedPercent}% Uploading...`
            : hostStudioLifecyclePhase === 'upload_complete'
              ? '✓ Upload complete'
              : hostStudioLifecyclePhase === 'processing_handoff'
                ? '→ Processing handoff'
                : !!recordingSession?.stoppedAt && !canOpenProject
                  ? `↑ ${uploadedPercent}% Uploading...`
                  : null
        : `↑ ${uploadedPercent}% Uploading...`;
    const recordingSeconds = recordingSession?.startedAt
      ? Math.max(0, Math.floor((Date.now() - new Date(recordingSession.startedAt).getTime()) / 1000))
      : 0;
    const recordingClock = `${String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:${String(
      recordingSeconds % 60
    ).padStart(2, '0')}`;
    const isMicOff = !active.isMicEnabled;
    const isCamOff = !active.isCameraEnabled;
    const shouldReserveUploadBarSpace = localStudioRole === 'host' && uploadOverlayOpen;
    const floatingUploadLayout = {
      leftInset: 54,
      rightInset: showStudioPeoplePanel ? 510 : 170,
      bottomInset: 150,
    };

    return (
      <main className={`${spaceGrotesk.className} h-screen overflow-hidden bg-[#07090f] text-slate-100`}>
        <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col px-5 py-4">
          <header className="flex items-center justify-between rounded-2xl border border-[#1a1f2a] bg-[#0f131a] px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/" className="rounded-full p-1 text-slate-300 hover:bg-[#1b2130] hover:text-white">
                ←
              </Link>
              <p className="text-xl font-semibold tracking-[0.2em] text-slate-100">RIVERSIDE</p>
              <span className="text-slate-600">|</span>
              <p className="truncate text-base text-slate-400">{displayName || 'Host'} KUMAR&apos;s Studio</p>
              <p className="truncate text-xl font-semibold text-slate-100">Untitled Recording</p>
            </div>

            <div className="flex items-center gap-2">
              {isRecording && (
                <span className="rounded-full bg-rose-500/20 px-3 py-1 text-sm font-semibold text-rose-200">
                  REC {recordingClock}
                </span>
              )}
              {showUploadChip && (
                <span className="rounded-2xl bg-violet-500/35 px-4 py-2 text-sm font-semibold text-violet-100">
                  {uploadChipLabel}
                </span>
              )}
              <button
                type="button"
                className="flex items-center rounded-2xl border border-[#2a2f3b] bg-[#1c212e] px-4 py-2 text-sm font-medium hover:border-slate-500"
              >
                <span className="mr-1.5 text-lg">+</span>
                Live stream
              </button>
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#2a2f3b] bg-[#1c212e] text-sm"
              >
                ?
              </button>
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#2a2f3b] bg-[#1c212e] text-sm"
              >
                ⚙
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsInviteModalOpen(true);
                  setShowAddParticipantPanel(false);
                  setInviteNotice(null);
                  setCopyState('idle');
                }}
                className="rounded-2xl border border-[#2a2f3b] bg-[#1c212e] px-4 py-2 text-sm font-medium hover:border-slate-500"
              >
                Invite
              </button>
            </div>
          </header>

          {(fallbackNotice || sessionError || recorderError || chunkUploadQueue.lastError || active.error) && (
            <div className="mt-3 space-y-2">
              {fallbackNotice && (
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  {fallbackNotice}
                </p>
              )}
              {sessionError && (
                <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  {sessionError}
                </p>
              )}
              {recorderError && (
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  {recorderError}
                </p>
              )}
              {chunkUploadQueue.lastError && (
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  Upload queue: {chunkUploadQueue.lastError}
                </p>
              )}
              {active.error && (
                <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  {active.error}
                </p>
              )}
            </div>
          )}

          <div className="mt-3 flex min-h-0 flex-1 gap-4">
            <section className="flex min-h-0 flex-1 flex-col rounded-3xl bg-[#090b10] p-3">
              <div className={`flex min-h-0 flex-1 gap-3 ${shouldReserveUploadBarSpace ? 'mb-20' : ''}`}>
                {showStudioInvitePanel && (
                  <aside className="hidden w-[400px] shrink-0 rounded-3xl border border-[#2b303d] bg-[#1e222b] p-6 xl:flex xl:flex-col">
                    <div className="mb-8 flex items-start justify-between">
                      <h2 className="max-w-[260px] text-[44px] font-semibold leading-[0.98] text-slate-100">
                        Invite someone to join remotely
                      </h2>
                      <button
                        type="button"
                        onClick={() => setShowStudioInvitePanel(false)}
                        className="rounded-full border border-slate-700 p-2 text-sm text-slate-300 hover:border-slate-500"
                        aria-label="Close invite panel"
                      >
                        ×
                      </button>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_86px_104px] gap-2">
                      <input
                        type="text"
                        readOnly
                        value={inviteLink}
                        className="min-w-0 truncate rounded-xl border border-[#333949] bg-[#202633] px-3 py-2 text-sm text-slate-300"
                      />
                      <select
                        value={inviteRole}
                        onChange={(event) => setInviteRole(event.target.value as 'guest' | 'host')}
                        className="rounded-xl border border-[#333949] bg-[#202633] px-2 py-2 text-sm"
                      >
                        <option value="guest">Guest</option>
                      </select>
                      <button
                        type="button"
                        onClick={handleCopyInviteLink}
                        className="rounded-xl bg-[#8b5cf6] px-2 py-2 text-sm font-semibold text-white hover:bg-[#7c4cf0]"
                      >
                        {copyState === 'copied' ? 'Copied' : 'Copy link'}
                      </button>
                    </div>
                    <div className="my-10 flex items-center gap-3 text-slate-500">
                      <div className="h-px flex-1 bg-[#303646]" />
                      <span className="rounded-full border border-[#3d4456] px-3 py-1 text-[11px] uppercase tracking-[0.18em]">New</span>
                      <div className="h-px flex-1 bg-[#303646]" />
                    </div>
                    <p className="text-4xl font-semibold leading-tight text-slate-100">Record someone next to you</p>
                    <button
                      type="button"
                      className="mt-6 rounded-xl border border-[#3a4051] bg-[#2f3542] px-4 py-3 text-lg font-medium text-slate-100"
                    >
                      Add an in-person guest <span className="ml-1 text-lime-300">⚡</span>
                    </button>
                  </aside>
                )}

                <div className="flex min-h-0 flex-1 rounded-3xl bg-[#05070c] p-2">
                  <div
                    className={`grid h-full w-full gap-3 ${
                      showStudioInvitePanel ? 'mx-auto max-w-[980px]' : ''
                    } ${stageGridClass}`}
                  >
                    {visibleTiles.map((tile) => {
                      const isLocalStudioTile =
                        tile.key === 'studio-local-camera' || tile.key === 'studio-local-screen';
                      return (
                        <ParticipantTile
                          key={tile.key}
                          tile={tile}
                          className={tileClassName}
                          showPin
                          isPinned={pinnedTileKey === tile.key}
                          onPin={() => togglePin(tile.key)}
                          micPublishEnabled={isLocalStudioTile ? active.isMicEnabled : undefined}
                          onTogglePublishMic={isLocalStudioTile ? active.toggleMic : undefined}
                          fill={shouldFillTiles}
                          showBadge={false}
                        />
                      );
                    })}
                    {visibleTiles.length === 0 && (
                      <div className="flex aspect-[4/3] items-center justify-center rounded-xl border border-dashed border-slate-700 bg-black/40 text-sm text-slate-500">
                        Waiting for camera feed...
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <footer className="mt-4 flex justify-center">
                <div className="flex flex-wrap items-start justify-center gap-3 rounded-2xl border border-slate-800 bg-[#121722] px-4 py-3">
                  {localStudioRole === 'host' && (
                    <>
                      <div className="flex flex-col items-center gap-1">
                        <button
                          type="button"
                          onClick={handleToggleRecordingSession}
                          disabled={!canControlRecording || sessionBusy}
                          className={`rounded-xl px-5 py-2.5 text-base font-semibold text-white ${
                            isRecording ? 'bg-rose-500' : 'bg-rose-500/90'
                          } disabled:opacity-60`}
                        >
                          {sessionBusy ? (isRecording ? 'Stopping...' : 'Starting...') : isRecording ? 'Stop' : 'Record'}
                        </button>
                        <span className="text-[10px] text-slate-400">{isRecording ? 'Stop' : 'Start'}</span>
                      </div>

                      <div className="h-12 w-px bg-slate-700/70" />
                    </>
                  )}

                  <div className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#222834] text-slate-100"
                    >
                      <StudioControlIcon kind="mark" />
                    </button>
                    <span className="text-[10px] text-slate-400">Mark Clip</span>
                  </div>

                  <div className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      onClick={active.toggleMic}
                      className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                        isMicOff ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'bg-[#222834] text-slate-100'
                      }`}
                    >
                      <StudioControlIcon kind="mic" off={isMicOff} />
                    </button>
                    <span className="text-[10px] text-slate-400">Mic</span>
                  </div>

                  <div className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      onClick={active.toggleCamera}
                      className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                        isCamOff ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'bg-[#222834] text-slate-100'
                      }`}
                    >
                      <StudioControlIcon kind="cam" off={isCamOff} />
                    </button>
                    <span className="text-[10px] text-slate-400">Cam</span>
                  </div>

                  <div className="flex flex-col items-center gap-1">
                    <button type="button" className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#222834] text-slate-100">
                      <StudioControlIcon kind="speaker" />
                    </button>
                    <span className="text-[10px] text-slate-400">Speaker</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <button type="button" className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#222834] text-slate-100">
                      <StudioControlIcon kind="react" />
                    </button>
                    <span className="text-[10px] text-slate-400">React</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <button type="button" className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#222834] text-slate-100">
                      <StudioControlIcon kind="raise" />
                    </button>
                    <span className="text-[10px] text-slate-400">Raise</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <button type="button" className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#222834] text-slate-100">
                      <StudioControlIcon kind="layout" />
                    </button>
                    <span className="text-[10px] text-slate-400">Layout</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <button type="button" className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#222834] text-slate-100">
                      <StudioControlIcon kind="script" />
                    </button>
                    <span className="text-[10px] text-slate-400">Script</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      onClick={active.toggleScreen}
                      className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                        active.isScreenSharing
                          ? 'border border-cyan-400/60 bg-cyan-500/20 text-cyan-100'
                          : 'bg-[#222834] text-slate-100'
                      }`}
                    >
                      <StudioControlIcon kind="share" />
                    </button>
                    <span className="text-[10px] text-slate-400">Share</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      onClick={handleLeave}
                      disabled={sessionBusy}
                      className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#4b1f2a] text-rose-100 hover:bg-[#5f2735] disabled:opacity-60"
                    >
                      <StudioControlIcon kind="leave" />
                    </button>
                    <span className="text-[10px] text-slate-400">Leave</span>
                  </div>
                </div>
              </footer>

              {chunkUploadQueue.stats.failed > 0 && (
                <div className="mt-2 flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => void chunkUploadQueue.retryFailed()}
                    className="rounded border border-amber-600/70 px-2 py-1 text-[10px] text-amber-300 hover:bg-amber-800/20"
                  >
                    Retry failed uploads
                  </button>
                </div>
              )}
            </section>

            <div className="flex">
              {showStudioPeoplePanel && (
                <aside className="w-[336px] rounded-3xl border border-[#252b38] bg-[#1a1f28] p-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-5xl font-semibold leading-none text-slate-100">People</h2>
                    <button
                      type="button"
                      onClick={() => {
                        setShowStudioPeoplePanel(false);
                        setShowAddParticipantPanel(false);
                      }}
                      className="rounded-full border border-slate-700 p-2 text-sm text-slate-400 hover:border-slate-500"
                    >
                      ×
                    </button>
                  </div>

                  <div className="mt-4 rounded-xl border border-[#2f3544] bg-[#242a36] p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-slate-300">Recording info</p>
                      <span className="text-slate-500">⌄</span>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {peopleForPanel.map((person) => (
                      <div key={person.id} className="rounded-xl border border-[#2f3544] bg-[#242a36] p-3">
                        <div className="flex items-start gap-3">
                          <div className="h-14 w-14 rounded-md border border-[#3a4153] bg-slate-900" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-xl font-semibold text-slate-100">{person.label}</p>
                              {isRecording && (
                                <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[11px] text-rose-200">REC</span>
                              )}
                            </div>
                            <p className="text-sm text-slate-400">{person.role}</p>
                            <p className="text-xs text-slate-500">{person.note}</p>
                          </div>
                        </div>
                        <div className="mt-3 h-1.5 w-full rounded-full bg-[#2f3748]">
                          <div
                            className="h-full rounded-full bg-emerald-300/90"
                            style={{ width: `${Math.max(person.percent, 5)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {showAddParticipantPanel && (
                    <div className="mt-4 rounded-xl border border-[#2f3544] bg-[#242a36] p-3">
                      <button
                        type="button"
                        onClick={() => {
                          setIsInviteModalOpen(true);
                          setInviteNotice(null);
                          setCopyState('idle');
                          setShowAddParticipantPanel(false);
                        }}
                        className="w-full rounded-xl bg-[#3a3f4a] px-4 py-3 text-left hover:bg-[#464e5f]"
                      >
                        <p className="text-lg font-semibold text-slate-100">Remote guest</p>
                        <p className="text-sm text-slate-400">Send a link to someone joining from another device</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowStudioInvitePanel(true);
                          setShowAddParticipantPanel(false);
                        }}
                        className="mt-3 w-full rounded-xl px-1 py-1 text-left"
                      >
                        <p className="text-lg font-medium text-slate-200">
                          In-person guest <span className="ml-1 text-lime-300">⚡</span>
                        </p>
                        <p className="text-sm text-slate-400">Someone recording next to you on the same device</p>
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowAddParticipantPanel((prev) => !prev)}
                    className="mt-4 w-full rounded-xl border border-[#3a4051] bg-[#252b37] px-3 py-2.5 text-lg text-slate-100 hover:border-slate-500"
                  >
                    + Add participant
                  </button>
                </aside>
              )}

              <div className="ml-3 flex w-[88px] shrink-0 flex-col items-center justify-center gap-5 rounded-[30px] border border-[#1a2334] bg-[#0b1322] py-7">
                <button
                  type="button"
                  onClick={() =>
                    setShowStudioPeoplePanel((prev) => {
                      const next = !prev;
                      if (!next) {
                        setShowAddParticipantPanel(false);
                      }
                      return next;
                    })
                  }
                  className={`flex w-[70px] flex-col items-center rounded-[24px] px-2 py-3 text-[13px] font-medium transition-colors ${
                    showStudioPeoplePanel
                      ? 'bg-[#303a52] text-white'
                      : 'bg-transparent text-[#8da0bf] hover:text-[#c7d3e8]'
                  }`}
                >
                  <span className="mb-1">
                    <StudioSidebarIcon kind="people" />
                  </span>
                  People
                </button>
                <button
                  type="button"
                  className="flex w-[70px] flex-col items-center gap-1 rounded-[20px] px-2 py-1.5 text-[13px] font-medium text-[#8da0bf] transition-colors hover:text-[#c7d3e8]"
                >
                  <StudioSidebarIcon kind="chat" />
                  Chat
                </button>
                <button
                  type="button"
                  className="flex w-[70px] flex-col items-center gap-1 rounded-[20px] px-2 py-1.5 text-[13px] font-medium text-[#8da0bf] transition-colors hover:text-[#c7d3e8]"
                >
                  <StudioSidebarIcon kind="brand" />
                  Brand
                </button>
                <button
                  type="button"
                  className="flex w-[70px] flex-col items-center gap-1 rounded-[20px] px-2 py-1.5 text-[13px] font-medium text-[#8da0bf] transition-colors hover:text-[#c7d3e8]"
                >
                  <StudioSidebarIcon kind="text" />
                  Text
                </button>
                <button
                  type="button"
                  className="flex w-[70px] flex-col items-center gap-1 rounded-[20px] px-2 py-1.5 text-[13px] font-medium text-[#8da0bf] transition-colors hover:text-[#c7d3e8]"
                >
                  <StudioSidebarIcon kind="media" />
                  Media
                </button>
              </div>
            </div>
          </div>
        </div>

        <UploadStatusModal
          open={uploadOverlayOpen}
          participants={progressParticipants}
          canOpenProject={canOpenProject}
          phase={localStudioRole === 'host' ? hostStudioLifecyclePhase ?? undefined : undefined}
          variant={localStudioRole === 'host' ? 'floating' : 'modal'}
          floatingLayout={localStudioRole === 'host' ? floatingUploadLayout : undefined}
          summary={
            uploadCompletion.hasTrackEvidence || uploadCompletion.participantsTotal > 0
              ? {
                  participantsTotal: uploadCompletion.participantsTotal,
                  participantsCompleted: uploadCompletion.participantsCompleted,
                  tracksTotal: uploadCompletion.tracksTotal,
                  tracksUploaded: uploadCompletion.tracksUploaded,
                  chunksTotal: uploadCompletion.chunksTotal,
                  chunksUploaded: uploadCompletion.chunksUploaded,
                }
              : undefined
          }
          keepPageOpenHint={
            localStudioRole === 'host'
              ? hostStudioLifecyclePhase === 'stopping' || hostStudioLifecyclePhase === 'uploading'
              : showUploadStatusModal
          }
          canDismiss={
            localStudioRole === 'host'
              ? hostStudioLifecyclePhase === 'upload_complete' ||
                hostStudioLifecyclePhase === 'processing_handoff'
              : true
          }
          onClose={() => {
            if (localStudioRole !== 'host') {
              setShowUploadStatusModal(false);
            }
          }}
          onGoToProject={() => {
            if (!canOpenProject) return;
            setShowUploadStatusModal(false);
            if (localStudioRole === 'host') {
              router.push(`/recordings/${recordingId}`);
            }
          }}
        />

        {isInviteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
            <div className="w-full max-w-[760px] rounded-3xl border border-[#373d4a] bg-[#20242d] p-6 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-4xl font-semibold text-slate-100">Invite people</h3>
                <button
                  type="button"
                  onClick={() => {
                    setIsInviteModalOpen(false);
                    setInviteNotice(null);
                    setCopyState('idle');
                  }}
                  className="rounded-full border border-slate-600 p-2 text-sm text-slate-300 hover:border-slate-400"
                >
                  ×
                </button>
              </div>
              <p className="text-base text-slate-400">
                Invite people to join your recording session.{' '}
                <span className="text-[#b692ff]">About studio roles</span>
              </p>

              <div className="mt-6 space-y-3">
                <p className="text-2xl font-semibold text-slate-100">Share a link</p>
                <p className="text-sm text-slate-400">Copy the link below and share with others.</p>
                <div className="grid gap-2 md:grid-cols-[1fr_108px_120px]">
                  <input
                    type="text"
                    readOnly
                    value={inviteLink}
                    className="rounded-xl border border-[#3a4151] bg-[#2b3140] px-3 py-3 text-sm text-slate-100"
                  />
                  <select
                    value={inviteRole}
                    onChange={(event) => setInviteRole(event.target.value as 'guest' | 'host')}
                    className="rounded-xl border border-[#3a4151] bg-[#2b3140] px-3 py-3 text-sm text-slate-100"
                  >
                    <option value="guest">Guest</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleCopyInviteLink}
                    className="rounded-xl bg-[#8b5cf6] px-3 py-3 text-sm font-semibold text-white hover:bg-[#7c4cf0]"
                  >
                    {copyState === 'copied' ? 'Copied' : 'Copy link'}
                  </button>
                </div>
              </div>

              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-[#404756]" />
                <span className="text-slate-400">Or</span>
                <div className="h-px flex-1 bg-[#404756]" />
              </div>

              <div className="space-y-3">
                <p className="text-2xl font-semibold text-slate-100">Invite via email</p>
                <p className="text-sm text-slate-400">
                  An email with instructions on how to join will be sent to all invitees.
                </p>
                <div className="grid gap-2 md:grid-cols-[1fr_108px_120px]">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="example@email.com"
                    className="rounded-xl border border-[#3a4151] bg-[#2b3140] px-3 py-3 text-sm text-slate-100 placeholder:text-slate-500"
                  />
                  <select
                    value={inviteRole}
                    onChange={(event) => setInviteRole(event.target.value as 'guest' | 'host')}
                    className="rounded-xl border border-[#3a4151] bg-[#2b3140] px-3 py-3 text-sm text-slate-100"
                  >
                    <option value="guest">Guest</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleInviteByEmail}
                    className="rounded-xl bg-[#8b5cf6] px-3 py-3 text-sm font-semibold text-white hover:bg-[#7c4cf0]"
                  >
                    Send invite
                  </button>
                </div>
              </div>

              {inviteNotice && (
                <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  {inviteNotice}
                </p>
              )}
            </div>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className={`${spaceGrotesk.className} h-[100dvh] overflow-hidden bg-[#0b0d11] text-slate-100`}>
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#171a22_0%,#0c0f14_45%,#07090d_100%)]" />
      </div>

      <div className="mx-auto flex h-full w-full max-w-[1700px] flex-col px-4 py-4">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800/90 bg-[#12151c]/80 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:text-white">
              Back
            </Link>
            <div>
              <p className="text-base font-semibold">Meet</p>
              <p className="font-mono text-[11px] text-slate-500">roomId: {recordingId}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] text-slate-300">
              {active.status === 'idle' && 'Not connected'}
              {active.status === 'connecting' && 'Connecting'}
              {active.status === 'reconnecting' && 'Reconnecting'}
              {active.status === 'connected' && 'Live'}
              {active.status === 'error' && 'Error'}
            </span>
            <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] text-slate-300">
              Participants: {active.peers.length + 1}
            </span>
            <div className="relative" data-meet-view-menu-root>
              <button
                type="button"
                onClick={() => setShowMeetViewMenu((prev) => !prev)}
                className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] text-slate-300 hover:border-slate-500"
              >
                View ▾
              </button>

              {showMeetViewMenu && (
                <div className="absolute right-0 top-10 z-40 w-52 rounded-xl border border-slate-700 bg-[#1b1e24] p-1 shadow-2xl">
                  <button
                    type="button"
                    onClick={() => {
                      setMeetStageFit((prev) => (prev === 'contain' ? 'cover' : 'contain'));
                      setShowMeetViewMenu(false);
                    }}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/60"
                  >
                    {meetStageFit === 'contain' ? 'Fill screen' : 'Fit screen'}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await toggleMeetFullscreen();
                      setShowMeetViewMenu(false);
                    }}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/60"
                  >
                    Full screen
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMeetPeoplePanel((prev) => !prev);
                      setShowMeetViewMenu(false);
                    }}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/60"
                  >
                    {showMeetPeoplePanel ? 'Hide people' : 'Show people'}
                  </button>
                  {hasRemoteStage && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowMeetSelfPreview((prev) => !prev);
                        setShowMeetViewMenu(false);
                      }}
                      className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/60"
                    >
                      {showMeetSelfPreview ? 'Hide self' : 'Show self'}
                    </button>
                  )}
                  {hasRemoteStage && showMeetSelfPreview && (
                    <button
                      type="button"
                      onClick={() => {
                        setMeetSelfPreviewExpanded((prev) => !prev);
                        setShowMeetViewMenu(false);
                      }}
                      className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/60"
                    >
                      {meetSelfPreviewExpanded ? 'Minimize self' : 'Maximize self'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {fallbackNotice && (
          <p className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
            {fallbackNotice}
          </p>
        )}

        {active.error && (
          <p className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs text-red-200">
            {active.error}
          </p>
        )}

        <section
          ref={meetStageRef}
          className={`relative mt-4 grid min-h-0 flex-1 gap-3 overflow-hidden rounded-[28px] border border-slate-800/80 bg-[#090b0f] p-3 ${
            showMeetPeoplePanel ? 'lg:grid-cols-[minmax(0,1fr)_320px]' : 'lg:grid-cols-1'
          }`}
        >
          <div className="relative h-full min-h-0 overflow-hidden rounded-[22px] border border-slate-800 bg-black">
            <div
              className="h-full w-full"
              onContextMenu={(event) =>
                openMeetContextMenu(event, meetMainTile.key, true)
              }
            >
              <ParticipantTile
                tile={meetMainTile}
                className="h-full w-full rounded-none border-transparent bg-black"
                fit={meetStageFit}
                fill
                showBadge={meetMainTile.badge === 'Screen'}
              />
            </div>

            {pinnedTileKey && (
              <div className="absolute left-4 top-4 z-20 rounded-full border border-cyan-300/40 bg-cyan-500/20 px-3 py-1 text-[11px] text-cyan-100">
                Pinned
              </div>
            )}

            {meetVisibleSecondaryTiles.length > 0 && (
              <div className="absolute bottom-4 right-4 z-20 flex max-w-[60%] gap-2 overflow-x-auto pb-1">
                {meetVisibleSecondaryTiles.slice(0, 5).map((tile) => (
                  <div
                    key={tile.key}
                    className={`shrink-0 ${
                      meetSelfPreviewExpanded && tile.key === meetLocalTile.key
                        ? 'w-[34vw] min-w-[280px] max-w-[540px]'
                        : 'w-56 md:w-64'
                    }`}
                    onContextMenu={(event) =>
                      openMeetContextMenu(event, tile.key, false)
                    }
                  >
                    <ParticipantTile
                      tile={tile}
                      className="w-full rounded-xl border-slate-600 bg-black"
                      fit="cover"
                      showBadge={tile.badge === 'Screen'}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {showMeetPeoplePanel && (
            <aside className="hidden h-full min-h-0 rounded-[22px] border border-slate-800 bg-[#181b22] p-4 lg:block">
              <div className="flex items-center justify-between">
                <h2 className="text-3xl font-semibold text-slate-100">People</h2>
                <button
                  type="button"
                  onClick={() => setShowMeetPeoplePanel(false)}
                  className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-300"
                >
                  ×
                </button>
              </div>

              <div className="mt-4">
                <button
                  type="button"
                  className="w-full rounded-full bg-sky-600/80 px-4 py-2 text-left text-sm font-semibold text-sky-100 hover:bg-sky-500/80"
                >
                  + Add people
                </button>
              </div>

              <div className="mt-3">
                <input
                  type="text"
                  placeholder="Search for people"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
                />
              </div>

              <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900/70">
                <div className="border-b border-slate-700 px-3 py-2 text-xs uppercase tracking-wide text-slate-400">
                  In the meeting
                </div>
                <ul className="max-h-[50vh] overflow-y-auto">
                  {meetPeople.map((person) => (
                    <li
                      key={person.id}
                      className="flex items-center justify-between border-b border-slate-800 px-3 py-3 last:border-b-0"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-slate-200">
                          {person.label.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-100">
                            {person.label}
                          </p>
                          <p className="text-xs text-slate-400">
                            {person.role}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="rounded-full border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:border-cyan-300/50"
                        onClick={() => {
                          if (!person.tileKey) return;
                          togglePin(person.tileKey);
                        }}
                        disabled={!person.tileKey}
                      >
                        Pin
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          )}
        </section>

        <footer className="mt-4 flex justify-center pb-2">
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-full border border-slate-800/90 bg-[#141821]/95 px-3 py-2">
            <button
              type="button"
              onClick={active.toggleMic}
              disabled={!isConnected}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                active.isMicEnabled
                  ? 'bg-slate-800 text-slate-100'
                  : 'bg-rose-500/20 text-rose-200'
              } disabled:opacity-50`}
            >
              {active.isMicEnabled ? 'Mic on' : 'Mic off'}
            </button>

            <button
              type="button"
              onClick={active.toggleCamera}
              disabled={!isConnected}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                active.isCameraEnabled
                  ? 'bg-slate-800 text-slate-100'
                  : 'bg-rose-500/20 text-rose-200'
              } disabled:opacity-50`}
            >
              {active.isCameraEnabled ? 'Camera on' : 'Camera off'}
            </button>

            <button
              type="button"
              onClick={active.toggleScreen}
              disabled={!isConnected}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                active.isScreenSharing
                  ? 'bg-cyan-500/20 text-cyan-200'
                  : 'bg-slate-800 text-slate-100'
              } disabled:opacity-50`}
            >
              {active.isScreenSharing ? 'Stop sharing' : 'Share screen'}
            </button>

            <button
              type="button"
              onClick={isConnected ? handleLeave : handleJoin}
              disabled={!isConnected && active.status === 'connecting'}
              className={`rounded-full px-5 py-2 text-sm font-semibold ${
                isConnected
                  ? 'bg-rose-500 text-white hover:bg-rose-400'
                  : 'bg-emerald-500 text-white hover:bg-emerald-400'
              } disabled:opacity-60`}
            >
              {isConnected ? 'Leave' : active.status === 'connecting' ? 'Joining...' : 'Join'}
            </button>
          </div>
        </footer>
      </div>

      {meetContextMenu && (
        <div
          className="fixed z-[80] min-w-52 rounded-xl border border-slate-700 bg-[#1b1e24] p-1 shadow-2xl"
          style={{ left: meetContextMenu.x, top: meetContextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          {meetContextMenu.isMain ? (
            <>
              {pinnedTileKey === meetContextMenu.tileKey ? (
                <button
                  type="button"
                  onClick={() => {
                    setPinnedTileKey(null);
                    closeMeetContextMenu();
                  }}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/60"
                >
                  Unpin from screen
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setPinnedTileKey(meetContextMenu.tileKey);
                    closeMeetContextMenu();
                  }}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/60"
                >
                  Pin to screen
                </button>
              )}
              {meetContextMenu.tileKey === meetLocalTile.key && hasRemoteStage && (
                <button
                  type="button"
                  onClick={() => {
                    setPinnedTileKey(null);
                    closeMeetContextMenu();
                  }}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/60"
                >
                  Show in a tile
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setPinnedTileKey(meetContextMenu.tileKey);
                closeMeetContextMenu();
              }}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/60"
            >
              Pin to screen
            </button>
          )}

          {meetContextMenu.tileKey === meetLocalTile.key && !meetContextMenu.isMain && (
            <>
              <button
                type="button"
                onClick={() => {
                  setShowMeetSelfPreview(false);
                  closeMeetContextMenu();
                }}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/60"
              >
                Minimize
              </button>
              <button
                type="button"
                onClick={() => {
                  setMeetSelfPreviewExpanded((prev) => !prev);
                  closeMeetContextMenu();
                }}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/60"
              >
                {meetSelfPreviewExpanded ? 'Normal size' : 'Maximize preview'}
              </button>
            </>
          )}

          <button
            type="button"
            onClick={async () => {
              await toggleMeetFullscreen();
              closeMeetContextMenu();
            }}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/60"
          >
            Full screen
          </button>
        </div>
      )}
    </main>
  );
}
