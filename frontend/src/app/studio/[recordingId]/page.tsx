'use client';

import React, { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Space_Grotesk } from 'next/font/google';
import { useSearchParams } from 'next/navigation';
import { LiveKitAPI } from '@/lib/api';
import { useSession } from '@/lib/useSession';
import {
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteParticipant,
} from 'livekit-client';
import { useMeshRoom } from '@/lib/studio/useMeshRoom';

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
};

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

function getTrack(participant: Participant, source: Track.Source): Track | null {
  const pub = participant.getTrackPublication(source);
  return pub?.track ?? null;
}

function useAttachMedia<T extends HTMLMediaElement>(
  mediaRef: React.RefObject<T | null>,
  source?: MediaSource,
  kind: 'video' | 'audio' = 'video'
) {
  useEffect(() => {
    const element = mediaRef.current;
    if (!element) return;

    if (!source) {
      if ('srcObject' in element) {
        (element as HTMLMediaElement).srcObject = null;
      }
      return;
    }

    if (source.kind === 'livekit') {
      if (!source.track) return;
      source.track.attach(element);
      return () => {
        try {
          source.track?.detach(element);
        } catch {
          // ignore
        }
      };
    }

    if (source.kind === 'media') {
      (element as HTMLMediaElement).srcObject = source.stream ?? null;
      element.play?.().catch(() => {});
      return () => {
        try {
          (element as HTMLMediaElement).srcObject = null;
        } catch {
          // ignore
        }
      };
    }
  }, [mediaRef, source, kind]);
}

function ParticipantTile({
  tile,
  className,
  showPin = false,
  isPinned = false,
  onPin,
  fit = 'cover',
  fill = false,
  showBadge = true,
}: {
  tile: Tile;
  className?: string;
  showPin?: boolean;
  isPinned?: boolean;
  onPin?: () => void;
  fit?: 'cover' | 'contain';
  fill?: boolean;
  showBadge?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const hasVideo = tile.video.kind === 'livekit'
    ? !!tile.video.track
    : !!tile.video.stream;

  useAttachMedia(videoRef, tile.video, 'video');
  useAttachMedia(audioRef, tile.audio, 'audio');

  return (
    <div
      className={`studio-rise relative w-full ${fill ? 'h-full' : 'aspect-video'} overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70 ${className ?? ''}`}
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

      {tile.audio && !tile.muted && (
        <audio ref={audioRef} autoPlay playsInline className="hidden" />
      )}

      {showBadge && !!tile.badge && (
        <div className="absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1 text-[11px] text-slate-100">
          {tile.badge}
        </div>
      )}
      {showPin && onPin && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onPin();
          }}
          className={`absolute right-3 top-3 rounded-full px-3 py-1 text-[11px] ${
            isPinned
              ? 'bg-cyan-400/30 text-cyan-100 border border-cyan-300/40'
              : 'bg-black/60 text-slate-200 border border-slate-500/40 hover:border-cyan-300/50'
          }`}
          title={isPinned ? 'Unpin from stage' : 'Pin to stage'}
        >
          {isPinned ? 'Unpin' : 'Pin'}
        </button>
      )}
      <div className="absolute left-3 bottom-3 rounded-full bg-black/60 px-3 py-1 text-[11px] text-slate-100">
        {tile.label}
      </div>
    </div>
  );
}

export default function StudioRecordingPage({ params }: StudioPageProps) {
  const { recordingId } = use(params);
  const searchParams = useSearchParams();
  const { profile } = useSession();
  const sessionMode: SessionMode = searchParams.get('mode') === 'meet' ? 'meet' : 'studio';

  const meshMaxPeers = Number(process.env.NEXT_PUBLIC_MESH_MAX_PEERS ?? '4');

  const [engine, setEngine] = useState<Engine>('livekit');
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [pinnedTileKey, setPinnedTileKey] = useState<string | null>(null);
  const [showPreJoin, setShowPreJoin] = useState(sessionMode === 'studio');
  const [displayName, setDisplayName] = useState('');
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
  const [inviteRole, setInviteRole] = useState<'guest' | 'host'>('guest');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [isRecording, setIsRecording] = useState(false);
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

  // ===== LiveKit state =====
  const [room, setRoom] = useState<Room | null>(null);
  const roomRef = useRef<Room | null>(null);

  const [livekitStatus, setLivekitStatus] = useState<ConnectionStatus>('idle');
  const [livekitError, setLivekitError] = useState<string | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);

  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const localCameraTrack =
    room?.localParticipant.getTrackPublication(Track.Source.Camera)?.track ?? null;
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
  }, [sessionMode, showPreJoin, startPreJoinPreview, stopPreJoinPreview]);

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
      const micTrack = getTrack(p, Track.Source.Microphone);
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
        });
      }
      if (cameraTrack) {
        tiles.push({
          key: `${p.sid}-camera`,
          label,
          badge: 'Camera',
          video: livekitSource(cameraTrack),
          audio: micTrack ? livekitSource(micTrack) : undefined,
        });
      }
      if (!cameraTrack && !screenTrack) {
        tiles.push({
          key: `${p.sid}-audio`,
          label,
          badge: 'Audio only',
          video: livekitSource(null),
          audio: micTrack ? livekitSource(micTrack) : undefined,
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
  const mesh = useMeshRoom({ roomId: recordingId, maxPeers: meshMaxPeers });

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
    const isMeetLocalPin =
      sessionMode === 'meet' &&
      (pinnedTileKey === 'meet-local-camera' || pinnedTileKey === 'meet-local-screen');
    if (!isRemotePinValid && !isMeetLocalPin) {
      setPinnedTileKey(null);
    }
  }, [active.tiles, pinnedTileKey, sessionMode]);

  const stageTile = useMemo(() => {
    if (active.tiles.length === 0) return null;
    if (pinnedTileKey) {
      const pinned = active.tiles.find((tile) => tile.key === pinnedTileKey);
      if (pinned) return pinned;
    }
    const screen = active.tiles.find((tile) => tile.badge === 'Screen');
    return screen ?? active.tiles[0];
  }, [active.tiles, pinnedTileKey]);

  const thumbnailTiles = useMemo(() => {
    if (!stageTile) return active.tiles;
    return active.tiles.filter((tile) => tile.key !== stageTile.key);
  }, [active.tiles, stageTile]);

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
    setJoiningFromPreJoin(true);
    const ok = await handleJoin();
    if (ok) {
      stopPreJoinPreview();
      setShowPreJoin(false);
    }
    setJoiningFromPreJoin(false);
  }

  function handleLeave() {
    setPinnedTileKey(null);
    active.leave();
    setEngine('livekit');
    setFallbackNotice(null);
    if (sessionMode === 'studio') {
      setShowPreJoin(true);
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

  const inviteLink =
    typeof window !== 'undefined'
      ? `${window.location.origin}/studio/${recordingId}?mode=studio`
      : '';

  async function handleCopyInviteLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopyState('copied');
    } catch {
      setCopyState('error');
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
    });

    if (active.localScreen.kind === 'livekit' ? !!active.localScreen.track : !!active.localScreen.stream) {
      tiles.push({
        key: 'studio-local-screen',
        label: `${displayName || 'You'} (Screen)`,
        badge: 'Screen',
        video: active.localScreen,
        muted: true,
      });
    }

    tiles.push(...active.tiles);
    return tiles;
  }, [active.localScreen, active.localVideo, active.tiles, displayName]);

  if (showPreJoin && sessionMode === 'studio') {
    return (
      <main className={`${spaceGrotesk.className} min-h-[calc(100vh-56px)] bg-[#101114] text-slate-50`}>
        <div className="mx-auto max-w-[1400px] px-5 py-6">
          <header className="flex items-center justify-between rounded-xl bg-[#16181d] px-4 py-3">
            <div className="flex items-center gap-3">
              <Link href="/" className="text-sm text-slate-400 hover:text-slate-200">
                ←
              </Link>
              <p className="text-lg font-semibold tracking-wide">RIVERSIDE</p>
              <span className="text-slate-500">|</span>
              <p className="text-sm text-slate-300">{displayName || 'Studio'}’s Studio</p>
            </div>
            <button
              type="button"
              className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-500"
            >
              Get help
            </button>
          </header>

          <div className="mt-4 rounded-lg bg-violet-500/70 px-4 py-2 text-sm text-violet-50">
            Tip: Plug your computer into a wall outlet for maximum recording quality.
          </div>

          <section className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_420px] items-start">
            <div className="max-w-xl space-y-5">
              <p className="text-lg text-slate-400">You&apos;re about to join your studio</p>
              <h1 className="text-5xl font-semibold leading-tight">Let&apos;s check your cam and mic</h1>

              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2">
                  <input
                    type="text"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    className="flex-1 bg-transparent text-base text-slate-100 outline-none placeholder:text-slate-500"
                    placeholder="Your display name"
                  />
                  <span className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300">Host</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setUsingHeadphones(false)}
                    className={`rounded-lg px-3 py-2 text-sm ${
                      !usingHeadphones
                        ? 'bg-violet-500 text-white'
                        : 'border border-slate-700 bg-slate-900 text-slate-300'
                    }`}
                  >
                    I am not using headphones
                  </button>
                  <button
                    type="button"
                    onClick={() => setUsingHeadphones(true)}
                    className={`rounded-lg px-3 py-2 text-sm ${
                      usingHeadphones
                        ? 'bg-violet-500 text-white'
                        : 'border border-slate-700 bg-slate-900 text-slate-300'
                    }`}
                  >
                    I am using headphones
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleJoinFromPreJoin}
                  disabled={preJoinStatus !== 'ready' || joiningFromPreJoin}
                  className="w-full rounded-lg bg-violet-500 px-4 py-2.5 text-lg font-semibold text-white hover:bg-violet-400 disabled:opacity-60"
                >
                  {joiningFromPreJoin ? 'Joining studio...' : 'Join studio'}
                </button>

                <p className="text-sm text-slate-400">
                  You are joining as host.
                </p>

                {preJoinError && (
                  <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                    {preJoinError}
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <div className="relative overflow-hidden rounded-xl bg-slate-950">
                <video
                  ref={preJoinVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="aspect-video w-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={togglePreJoinMic}
                    className={`rounded-full px-3 py-1 text-sm ${
                      preJoinMicEnabled ? 'bg-slate-800 text-slate-100' : 'bg-red-500 text-white'
                    }`}
                  >
                    {preJoinMicEnabled ? 'Mic on' : 'Mic off'}
                  </button>
                  <button
                    type="button"
                    onClick={togglePreJoinCam}
                    className={`rounded-full px-3 py-1 text-sm ${
                      preJoinCamEnabled ? 'bg-slate-800 text-slate-100' : 'bg-red-500 text-white'
                    }`}
                  >
                    {preJoinCamEnabled ? 'Cam on' : 'Cam off'}
                  </button>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                <label className="block rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200">
                  <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Camera</span>
                  <select
                    value={selectedCameraId}
                    onChange={(event) => setSelectedCameraId(event.target.value)}
                    className="w-full bg-transparent text-sm outline-none"
                  >
                    {cameraDevices.length === 0 && <option value="">Default camera</option>}
                    {cameraDevices.map((device) => (
                      <option key={device.id} value={device.id}>
                        {device.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200">
                  <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Microphone</span>
                  <select
                    value={selectedMicId}
                    onChange={(event) => setSelectedMicId(event.target.value)}
                    className="w-full bg-transparent text-sm outline-none"
                  >
                    {micDevices.length === 0 && <option value="">Default microphone</option>}
                    {micDevices.map((device) => (
                      <option key={device.id} value={device.id}>
                        {device.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200">
                  <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Speaker</span>
                  <select
                    value={selectedSpeakerId}
                    onChange={(event) => setSelectedSpeakerId(event.target.value)}
                    className="w-full bg-transparent text-sm outline-none"
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
                  className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-slate-500"
                >
                  {preJoinStatus === 'starting' ? 'Refreshing preview...' : 'Refresh preview'}
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (!showPreJoin && sessionMode === 'studio') {
    const people = [
      { id: 'local', label: displayName || 'You', role: 'Host' as const, isLocal: true },
      ...active.peers.map((peer) => ({
        id: peer.id,
        label: peer.label,
        role: 'Guest' as const,
        isLocal: false,
      })),
    ];

    const visibleTiles = studioCanvasTiles.slice(0, 4);

    return (
      <main className={`${spaceGrotesk.className} min-h-screen bg-[#0d0f13] text-slate-100`}>
        <div className="mx-auto max-w-[1500px] px-5 py-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              <header className="flex items-center justify-between rounded-xl bg-[#13151a] px-4 py-3">
                <div className="flex items-center gap-3">
                  <Link href="/" className="text-slate-300 hover:text-white">
                    ←
                  </Link>
                  <p className="text-2xl font-semibold tracking-wide">RIVERSIDE</p>
                  <span className="text-slate-600">|</span>
                  <p className="text-sm text-slate-300">{displayName || 'Host'}&apos;s Studio</p>
                  <p className="text-sm font-semibold text-slate-100">Untitled Recording</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-slate-700 bg-[#1c2027] px-4 py-2 text-sm hover:border-slate-500"
                  >
                    + Live stream
                  </button>
                  <button
                    type="button"
                    className="h-10 w-10 rounded-full border border-slate-700 bg-[#1c2027] text-sm"
                  >
                    ?
                  </button>
                  <button
                    type="button"
                    className="h-10 w-10 rounded-full border border-slate-700 bg-[#1c2027] text-sm"
                  >
                    ⚙
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsInviteModalOpen(true)}
                    className="rounded-full border border-slate-700 bg-[#1c2027] px-4 py-2 text-sm hover:border-slate-500"
                  >
                    Invite
                  </button>
                </div>
              </header>

              {fallbackNotice && (
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  {fallbackNotice}
                </p>
              )}
              {active.error && (
                <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  {active.error}
                </p>
              )}

              <section className="rounded-2xl border border-slate-800 bg-[#111319] p-4">
                <div className={`grid gap-3 ${visibleTiles.length > 1 ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
                  {visibleTiles.map((tile) => (
                    <ParticipantTile
                      key={tile.key}
                      tile={tile}
                      className="aspect-[4/3] rounded-xl border-slate-700 bg-black"
                      showPin
                      isPinned={pinnedTileKey === tile.key}
                      onPin={() => togglePin(tile.key)}
                    />
                  ))}

                  {visibleTiles.length === 0 && (
                    <div className="flex aspect-[4/3] items-center justify-center rounded-xl border border-dashed border-slate-700 bg-black/40 text-sm text-slate-500">
                      Waiting for camera feed...
                    </div>
                  )}
                </div>
              </section>

              <footer className="flex justify-center">
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800 bg-[#13151a] px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setIsRecording((prev) => !prev)}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                      isRecording ? 'bg-rose-500 text-white' : 'bg-rose-500/90 text-white'
                    }`}
                  >
                    {isRecording ? 'Recording' : 'Record'}
                  </button>
                  <button
                    type="button"
                    onClick={active.toggleMic}
                    className="rounded-xl bg-[#1f232b] px-3 py-2 text-sm text-slate-200 hover:bg-[#2a2f38]"
                  >
                    Mic
                  </button>
                  <button
                    type="button"
                    onClick={active.toggleCamera}
                    className="rounded-xl bg-[#1f232b] px-3 py-2 text-sm text-slate-200 hover:bg-[#2a2f38]"
                  >
                    Cam
                  </button>
                  <button
                    type="button"
                    className="rounded-xl bg-[#1f232b] px-3 py-2 text-sm text-slate-200 hover:bg-[#2a2f38]"
                  >
                    Speaker
                  </button>
                  <button
                    type="button"
                    className="rounded-xl bg-[#1f232b] px-3 py-2 text-sm text-slate-200 hover:bg-[#2a2f38]"
                  >
                    React
                  </button>
                  <button
                    type="button"
                    className="rounded-xl bg-[#1f232b] px-3 py-2 text-sm text-slate-200 hover:bg-[#2a2f38]"
                  >
                    Raise
                  </button>
                  <button
                    type="button"
                    className="rounded-xl bg-[#1f232b] px-3 py-2 text-sm text-slate-200 hover:bg-[#2a2f38]"
                  >
                    Layout
                  </button>
                  <button
                    type="button"
                    className="rounded-xl bg-[#1f232b] px-3 py-2 text-sm text-slate-200 hover:bg-[#2a2f38]"
                  >
                    Script
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsInviteModalOpen(true)}
                    className="rounded-xl bg-[#1f232b] px-3 py-2 text-sm text-slate-200 hover:bg-[#2a2f38]"
                  >
                    Share
                  </button>
                  <button
                    type="button"
                    onClick={handleLeave}
                    className="rounded-xl bg-[#4b1f2a] px-3 py-2 text-sm text-rose-100 hover:bg-[#5f2735]"
                  >
                    Leave
                  </button>
                </div>
              </footer>
            </div>

            <aside className="rounded-2xl border border-slate-800 bg-[#15171d] p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-4xl font-semibold">People</h2>
                <button
                  type="button"
                  className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-400"
                >
                  ×
                </button>
              </div>

              <div className="mt-4 rounded-xl border border-slate-800 bg-[#1b1e25] p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-300">Recording info</p>
                  <span className="text-slate-500">⌄</span>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {people.map((person) => (
                  <div key={person.id} className="rounded-xl border border-slate-800 bg-[#1b1e25] p-3">
                    <div className="flex items-center gap-3">
                      <div className="h-14 w-14 rounded-md border border-slate-700 bg-slate-900" />
                      <div>
                        <p className="text-xl font-semibold text-slate-100">{person.label}</p>
                        <p className="text-sm text-slate-400">{person.role}</p>
                      </div>
                    </div>
                    <div className="mt-3 h-2 w-full rounded-full bg-slate-800">
                      <div className="h-full w-1/3 rounded-full bg-emerald-400/80" />
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setIsInviteModalOpen(true)}
                className="mt-4 w-full rounded-xl border border-slate-700 bg-[#1b1e25] px-3 py-2 text-sm text-slate-100 hover:border-slate-500"
              >
                + Add participant
              </button>
            </aside>
          </div>
        </div>

        {isInviteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
            <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-[#1a1c21] p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-3xl font-semibold text-slate-100">Invite people</h3>
                <button
                  type="button"
                  onClick={() => {
                    setIsInviteModalOpen(false);
                    setInviteNotice(null);
                    setCopyState('idle');
                  }}
                  className="rounded-full border border-slate-600 px-3 py-1 text-sm text-slate-300"
                >
                  ×
                </button>
              </div>

              <p className="text-sm text-slate-400">
                Share a link or invite participants by email to join this recording session.
              </p>

              <div className="mt-5 space-y-3">
                <p className="text-xl font-semibold text-slate-100">Share a link</p>
                <div className="grid gap-2 md:grid-cols-[1fr_110px_120px]">
                  <input
                    type="text"
                    readOnly
                    value={inviteLink}
                    className="rounded-lg border border-slate-700 bg-[#23262e] px-3 py-2 text-sm text-slate-100"
                  />
                  <select
                    value={inviteRole}
                    onChange={(event) => setInviteRole(event.target.value as 'guest' | 'host')}
                    className="rounded-lg border border-slate-700 bg-[#23262e] px-3 py-2 text-sm text-slate-100"
                  >
                    <option value="guest">Guest</option>
                    <option value="host">Host</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleCopyInviteLink}
                    className="rounded-lg bg-violet-500 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-400"
                  >
                    {copyState === 'copied' ? 'Copied' : 'Copy link'}
                  </button>
                </div>
              </div>

              <div className="my-5 h-px bg-slate-700" />

              <div className="space-y-3">
                <p className="text-xl font-semibold text-slate-100">Invite via email</p>
                <div className="grid gap-2 md:grid-cols-[1fr_110px_120px]">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="example@email.com"
                    className="rounded-lg border border-slate-700 bg-[#23262e] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
                  />
                  <select
                    value={inviteRole}
                    onChange={(event) => setInviteRole(event.target.value as 'guest' | 'host')}
                    className="rounded-lg border border-slate-700 bg-[#23262e] px-3 py-2 text-sm text-slate-100"
                  >
                    <option value="guest">Guest</option>
                    <option value="host">Host</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleInviteByEmail}
                    className="rounded-lg bg-violet-500 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-400"
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
