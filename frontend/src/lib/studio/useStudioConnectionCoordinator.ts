'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LiveKitAPI } from '@/lib/api';
import {
  buildLivekitPeers,
  buildLivekitTiles,
} from '@/lib/studio/connection-view-model';
import {
  livekitSource,
  livekitTrackToStream,
  mediaSource,
  selectTracksAsStream,
  type MediaSource,
  type Tile,
} from '@/lib/studio/media';
import type { StudioPeerSummary } from '@/lib/studio/stage-view-model';
import { useMeshRoom } from '@/lib/studio/useMeshRoom';
import { Room, RoomEvent, Track, type RemoteParticipant } from 'livekit-client';

export type StudioEngine = 'livekit' | 'mesh';
export type StudioConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';
type SessionMode = 'meet' | 'studio';

type ActiveConnection = {
  status: StudioConnectionStatus;
  error: string | null;
  isMicEnabled: boolean;
  isCameraEnabled: boolean;
  isScreenSharing: boolean;
  localVideo: MediaSource;
  localScreen: MediaSource;
  tiles: Tile[];
  peers: StudioPeerSummary[];
  toggleMic: () => Promise<void> | void;
  toggleCamera: () => Promise<void> | void;
  toggleScreen: () => Promise<void> | void;
};

type UseStudioConnectionCoordinatorArgs = {
  recordingId: string;
  sessionMode: SessionMode;
  requestedStudioRole: 'host' | 'guest' | null;
  meshMaxPeers: number;
  allowStudioMeshFallback: boolean;
  probeStreamQuality: (stream: MediaStream) => unknown | Promise<unknown>;
  onGuestRemoved: () => void;
};

function buildMeshTiles(remotePeers: ReturnType<typeof useMeshRoom>['remotePeers']): Tile[] {
  return remotePeers.flatMap((peer) => {
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
}

function buildMeshPeers(remotePeers: ReturnType<typeof useMeshRoom>['remotePeers']): StudioPeerSummary[] {
  return remotePeers.map((peer) => ({
    id: peer.peerId,
    label: `${peer.role === 'host' ? 'Host' : 'Guest'} · ${peer.peerId.slice(0, 6)}`,
  }));
}

export function useStudioConnectionCoordinator({
  recordingId,
  sessionMode,
  requestedStudioRole,
  meshMaxPeers,
  allowStudioMeshFallback,
  probeStreamQuality,
  onGuestRemoved,
}: UseStudioConnectionCoordinatorArgs) {
  const [engine, setEngine] = useState<StudioEngine>('livekit');
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [studioLayoutMode, setStudioLayoutMode] = useState<'grid' | 'screen_share_dominant'>(
    'grid'
  );
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null);

  const [room, setRoom] = useState<Room | null>(null);
  const roomRef = useRef<Room | null>(null);
  const [livekitStatus, setLivekitStatus] = useState<StudioConnectionStatus>('idle');
  const [livekitError, setLivekitError] = useState<string | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const mesh = useMeshRoom({
    roomId: recordingId,
    maxPeers: meshMaxPeers,
    role: requestedStudioRole ?? 'host',
  });

  const syncParticipants = useCallback((activeRoom: Room) => {
    setRemoteParticipants(Array.from(activeRoom.remoteParticipants.values()));
  }, []);

  const cleanupLiveKitRoom = useCallback((activeRoom?: Room | null) => {
    const roomToClose = activeRoom ?? roomRef.current;
    if (!roomToClose) return;
    try {
      roomToClose.removeAllListeners();
      roomToClose.disconnect();
    } catch {
      // ignore cleanup failures on forced disconnect
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanupLiveKitRoom();
    };
  }, [cleanupLiveKitRoom]);

  const livekitJoin = useCallback(async (): Promise<boolean> => {
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

      newRoom.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
        try {
          const message = JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;
          if (message.type === 'session_start' && typeof message.startedAt === 'string') {
            setSessionStartedAt(message.startedAt);
          }
          // Keep current behavior: guests leave immediately when the host broadcasts removal.
          if (message.type === 'remove_participant' && typeof message.participantId === 'string') {
            onGuestRemoved();
          }
        } catch {
          // ignore malformed data messages
        }
      });

      const refresh = () => syncParticipants(newRoom);
      newRoom.on(RoomEvent.ParticipantConnected, refresh);
      newRoom.on(RoomEvent.ParticipantDisconnected, refresh);
      newRoom.on(RoomEvent.TrackPublished, (publication) => {
        refresh();
        if (publication.source === Track.Source.ScreenShare) {
          setStudioLayoutMode('screen_share_dominant');
        }
      });
      newRoom.on(RoomEvent.TrackUnpublished, (publication) => {
        refresh();
        if (publication.source !== Track.Source.ScreenShare) return;
        const anyRemoteScreen = [...newRoom.remoteParticipants.values()].some(
          (participant) =>
            participant.getTrackPublication(Track.Source.ScreenShare)?.track != null
        );
        const localScreen =
          newRoom.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track != null;
        if (!anyRemoteScreen && !localScreen) {
          setStudioLayoutMode('grid');
        }
      });
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

      const probeOnLocalTrack = () => {
        const camPublication = newRoom.localParticipant.getTrackPublication(Track.Source.Camera);
        const micPublication = newRoom.localParticipant.getTrackPublication(Track.Source.Microphone);
        const camTrack = camPublication?.track?.mediaStreamTrack;
        const micTrack = micPublication?.track?.mediaStreamTrack;
        if (camTrack && micTrack) {
          newRoom.off(RoomEvent.LocalTrackPublished, probeOnLocalTrack);
          void probeStreamQuality(new MediaStream([camTrack, micTrack]));
        }
      };
      newRoom.on(RoomEvent.LocalTrackPublished, probeOnLocalTrack);
      probeOnLocalTrack();

      return true;
    } catch (error) {
      cleanupLiveKitRoom(roomRef.current);
      roomRef.current = null;
      setRoom(null);
      setLivekitStatus('error');
      setLivekitError((error as Error)?.message ?? 'Failed to join the LiveKit room.');
      return false;
    }
  }, [cleanupLiveKitRoom, livekitStatus, onGuestRemoved, probeStreamQuality, recordingId, syncParticipants]);

  const livekitLeave = useCallback(() => {
    cleanupLiveKitRoom(roomRef.current);
    roomRef.current = null;
    setRoom(null);
    setRemoteParticipants([]);
    setIsMicEnabled(false);
    setIsCameraEnabled(false);
    setIsScreenSharing(false);
    setLivekitStatus('idle');
  }, [cleanupLiveKitRoom]);

  const livekitToggleMic = useCallback(async () => {
    const activeRoom = roomRef.current;
    if (!activeRoom) return;
    const next = !isMicEnabled;
    try {
      await activeRoom.localParticipant.setMicrophoneEnabled(next);
      setIsMicEnabled(next);
    } catch (error) {
      setLivekitError((error as Error)?.message ?? 'Failed to toggle microphone.');
    }
  }, [isMicEnabled]);

  const livekitToggleCamera = useCallback(async () => {
    const activeRoom = roomRef.current;
    if (!activeRoom) return;
    const next = !isCameraEnabled;
    try {
      await activeRoom.localParticipant.setCameraEnabled(next);
      setIsCameraEnabled(next);
    } catch (error) {
      setLivekitError((error as Error)?.message ?? 'Failed to toggle camera.');
    }
  }, [isCameraEnabled]);

  const livekitToggleScreenShare = useCallback(async () => {
    const activeRoom = roomRef.current;
    if (!activeRoom) return;
    const next = !isScreenSharing;
    try {
      await activeRoom.localParticipant.setScreenShareEnabled(next);
      setIsScreenSharing(next);
      if (next) {
        setStudioLayoutMode('screen_share_dominant');
        return;
      }
      const anyRemoteScreen = [...activeRoom.remoteParticipants.values()].some(
        (participant) => participant.getTrackPublication(Track.Source.ScreenShare)?.track != null
      );
      if (!anyRemoteScreen) {
        setStudioLayoutMode('grid');
      }
    } catch (error) {
      setLivekitError((error as Error)?.message ?? 'Failed to toggle screen share.');
    }
  }, [isScreenSharing]);

  const livekitTiles = useMemo(() => buildLivekitTiles(remoteParticipants), [remoteParticipants]);
  const livekitPeers = useMemo(() => buildLivekitPeers(remoteParticipants), [remoteParticipants]);

  const localCameraTrack =
    room?.localParticipant.getTrackPublication(Track.Source.Camera)?.track ?? null;
  const localMicTrack =
    room?.localParticipant.getTrackPublication(Track.Source.Microphone)?.track ?? null;
  const localScreenTrack =
    room?.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track ?? null;

  const meshTiles = useMemo(() => buildMeshTiles(mesh.remotePeers), [mesh.remotePeers]);
  const meshPeers = useMemo(() => buildMeshPeers(mesh.remotePeers), [mesh.remotePeers]);

  const livekitCameraStream = useMemo(() => {
    const cameraTrack = (localCameraTrack as any)?.mediaStreamTrack as MediaStreamTrack | undefined;
    const micTrack = (localMicTrack as any)?.mediaStreamTrack as MediaStreamTrack | undefined;
    if (!cameraTrack || cameraTrack.readyState !== 'live') return null;
    const tracks: MediaStreamTrack[] = [cameraTrack];
    if (micTrack && micTrack.readyState === 'live') tracks.push(micTrack);
    return new MediaStream(tracks);
  }, [localCameraTrack, localMicTrack]);

  const livekitMicStream = useMemo(() => livekitTrackToStream(localMicTrack), [localMicTrack]);

  const livekitScreenStream = useMemo(() => {
    const screenTrack = (localScreenTrack as any)?.mediaStreamTrack as MediaStreamTrack | undefined;
    const micTrack = (localMicTrack as any)?.mediaStreamTrack as MediaStreamTrack | undefined;
    if (!screenTrack || screenTrack.readyState !== 'live') return null;
    const tracks: MediaStreamTrack[] = [screenTrack];
    if (micTrack && micTrack.readyState === 'live') tracks.push(micTrack);
    return new MediaStream(tracks);
  }, [localMicTrack, localScreenTrack]);

  const meshCameraStream = useMemo(
    () => selectTracksAsStream(mesh.localStream, 'video'),
    [mesh.localStream]
  );
  const meshMicStream = useMemo(
    () => selectTracksAsStream(mesh.localStream, 'audio'),
    [mesh.localStream]
  );
  const meshScreenStream = useMemo(() => mesh.localScreenStream ?? null, [mesh.localScreenStream]);

  const recordingStreams = useMemo(
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

  const active: ActiveConnection = useMemo(
    () =>
      engine === 'livekit'
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
            toggleMic: livekitToggleMic,
            toggleCamera: livekitToggleCamera,
            toggleScreen: livekitToggleScreenShare,
          }
        : {
            status: mesh.status as StudioConnectionStatus,
            error: mesh.error,
            isMicEnabled: !mesh.isMicMuted,
            isCameraEnabled: !mesh.isCameraOff,
            isScreenSharing: mesh.isScreenSharing,
            localVideo: mediaSource(mesh.localStream),
            localScreen: mediaSource(mesh.localScreenStream),
            tiles: meshTiles,
            peers: meshPeers,
            toggleMic: mesh.toggleMic,
            toggleCamera: mesh.toggleCamera,
            toggleScreen: mesh.isScreenSharing ? mesh.stopScreenShare : mesh.startScreenShare,
          },
    [
      engine,
      isCameraEnabled,
      isMicEnabled,
      isScreenSharing,
      livekitError,
      livekitPeers,
      livekitStatus,
      livekitTiles,
      livekitToggleCamera,
      livekitToggleMic,
      livekitToggleScreenShare,
      localCameraTrack,
      localScreenTrack,
      mesh.error,
      mesh.isCameraOff,
      mesh.isMicMuted,
      mesh.isScreenSharing,
      mesh.localScreenStream,
      mesh.localStream,
      mesh.startScreenShare,
      mesh.stopScreenShare,
      mesh.status,
      mesh.toggleCamera,
      mesh.toggleMic,
      meshPeers,
      meshTiles,
    ]
  );

  const isConnected = active.status === 'connected' || active.status === 'reconnecting';

  const join = useCallback(async () => {
    if (engine === 'livekit') {
      const joined = await livekitJoin();
      if (joined) return true;

      const canFallbackToMesh = sessionMode === 'meet' || allowStudioMeshFallback;
      if (!canFallbackToMesh) {
        setFallbackNotice(
          'LiveKit connection failed. Retry to rejoin. Mesh fallback is disabled in studio mode.'
        );
        return false;
      }

      setFallbackNotice('LiveKit connection failed. Switching to mesh fallback.');
      setEngine('mesh');
      try {
        await mesh.join();
        return true;
      } catch {
        return false;
      }
    }

    try {
      await mesh.join();
      return true;
    } catch {
      return false;
    }
  }, [allowStudioMeshFallback, engine, livekitJoin, mesh, sessionMode]);

  useEffect(() => {
    if (sessionMode !== 'studio') return;
    if (allowStudioMeshFallback) return;
    if (engine !== 'mesh') return;
    setEngine('livekit');
    setFallbackNotice('Studio mode requires LiveKit. Rejoining with LiveKit.');
  }, [allowStudioMeshFallback, engine, sessionMode]);

  const leaveAndReset = useCallback(() => {
    if (engine === 'livekit') {
      livekitLeave();
    } else {
      mesh.leave();
    }
    setEngine('livekit');
    setFallbackNotice(null);
  }, [engine, livekitLeave, mesh]);

  const broadcastSessionStart = useCallback(async (startedAt: string) => {
    const activeRoom = roomRef.current;
    if (!activeRoom) return;
    const message = JSON.stringify({ type: 'session_start', startedAt });
    await activeRoom.localParticipant.publishData(new TextEncoder().encode(message), {
      reliable: true,
    });
    setSessionStartedAt(startedAt);
  }, []);

  const broadcastRemoveParticipant = useCallback(async (participantId: string) => {
    const activeRoom = roomRef.current;
    if (!activeRoom) return;
    const message = JSON.stringify({ type: 'remove_participant', participantId });
    await activeRoom.localParticipant.publishData(new TextEncoder().encode(message), {
      reliable: true,
    });
  }, []);

  return {
    active,
    engine,
    fallbackNotice,
    isConnected,
    join,
    leaveAndReset,
    recordingStreams,
    sessionStartedAt,
    studioLayoutMode,
    broadcastSessionStart,
    broadcastRemoveParticipant,
  };
}
