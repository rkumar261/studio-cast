'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWebSocketConnection } from './useWebSocketConnection';
import { useLocalMedia } from './useLocalMedia';

type Role = 'host' | 'guest';

type MeshPeerView = {
  peerId: string;
  role: Role;
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
  cameraStreamId?: string | null;
};

type MeshStatus = 'idle' | 'connecting' | 'connected' | 'error';

type WebRtcSignalPayload =
  | { kind: 'offer'; sdp: RTCSessionDescriptionInit }
  | { kind: 'answer'; sdp: RTCSessionDescriptionInit }
  | { kind: 'ice'; candidate: RTCIceCandidateInit };

type MeshJoinMessage = {
  type: 'join';
  roomId: string;
  peerId: string;
  role: Role;
};

type MeshSignalMessage = {
  type: 'signal';
  roomId: string;
  peerId: string;
  targetPeerId?: string;
  payload: WebRtcSignalPayload;
};

type MeshLeaveMessage = {
  type: 'leave';
  roomId: string;
  peerId: string;
};

type MeshServerMessage =
  | {
      type: 'joined';
      roomId: string;
      peerId: string;
      role: Role;
      peers: Array<{ peerId: string; role: Role }>;
    }
  | {
      type: 'peer-joined';
      roomId: string;
      peerId: string;
      role: Role;
    }
  | {
      type: 'peer-left';
      roomId: string;
      peerId: string;
    }
  | {
      type: 'signal';
      roomId: string;
      fromPeerId: string;
      payload: WebRtcSignalPayload;
    }
  | {
      type: 'error';
      roomId?: string;
      message: string;
    };

type UseMeshRoomArgs = {
  roomId: string;
  maxPeers?: number;
  role?: Role;
};

function createPeerId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `peer-${Math.random().toString(36).slice(2)}`;
}

export function useMeshRoom({ roomId, maxPeers = 4, role = 'host' }: UseMeshRoomArgs) {
  const peerIdRef = useRef<string>(createPeerId());
  const roleRef = useRef<Role>(role);

  const [status, setStatus] = useState<MeshStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const [remotePeers, setRemotePeers] = useState<MeshPeerView[]>([]);
  const remotePeersRef = useRef<Map<string, MeshPeerView>>(new Map());
  const peerRolesRef = useRef<Map<string, Role>>(new Map());

  const pcRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const pendingOfferRef = useRef<Map<string, WebRtcSignalPayload>>(new Map());
  const ensurePeerConnectionRef = useRef<
    (peerId: string, shouldOffer: boolean) => Promise<void>
  >(async () => {});
  const handleRemoteSignalRef = useRef<
    (fromPeerId: string, payload: WebRtcSignalPayload) => Promise<void>
  >(async () => {});

  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenSendersRef = useRef<Map<string, RTCRtpSender>>(new Map());

  const {
    stream: localStream,
    status: mediaStatus,
    error: mediaError,
    isMicMuted,
    isCameraOff,
    start: startLocalMedia,
    stop: stopLocalMedia,
    toggleMic,
    toggleCamera,
  } = useLocalMedia();

  const [isScreenSharing, setIsScreenSharing] = useState(false);

  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  const syncRemotePeers = useCallback(() => {
    setRemotePeers(Array.from(remotePeersRef.current.values()));
  }, []);

  const registerRemotePeer = useCallback(
    (peerId: string, role: Role) => {
      peerRolesRef.current.set(peerId, role);
      if (!remotePeersRef.current.has(peerId)) {
        remotePeersRef.current.set(peerId, {
          peerId,
          role,
          cameraStream: null,
          screenStream: null,
          cameraStreamId: null,
        });
        syncRemotePeers();
      }
    },
    [syncRemotePeers]
  );

  const removeRemotePeer = useCallback(
    (peerId: string) => {
      peerRolesRef.current.delete(peerId);
      remotePeersRef.current.delete(peerId);
      syncRemotePeers();
    },
    [syncRemotePeers]
  );

  const closePeerConnection = useCallback(
    (peerId: string) => {
      const pc = pcRef.current.get(peerId);
      if (pc) {
        try {
          pc.onicecandidate = null;
          pc.ontrack = null;
          pc.onconnectionstatechange = null;
          pc.close();
        } catch {
          // ignore
        }
      }
      pcRef.current.delete(peerId);
      pendingIceRef.current.delete(peerId);
      pendingOfferRef.current.delete(peerId);
      screenSendersRef.current.delete(peerId);
    },
    []
  );

  const closeAllPeers = useCallback(() => {
    for (const peerId of pcRef.current.keys()) {
      closePeerConnection(peerId);
    }
    remotePeersRef.current.clear();
    peerRolesRef.current.clear();
    syncRemotePeers();
  }, [closePeerConnection, syncRemotePeers]);

  const { status: wsStatus, connect, disconnect, sendJson } = useWebSocketConnection(
    '/v1/studio/signaling',
    {
      onOpen: () => {
        const joinMsg: MeshJoinMessage = {
          type: 'join',
          roomId,
          peerId: peerIdRef.current,
          role: roleRef.current,
        };
        sendJson(joinMsg);
      },
      onClose: () => {
        setStatus('idle');
        closeAllPeers();
      },
      onError: () => {
        setStatus('error');
        setError('WebSocket error occurred.');
      },
      onMessage: (data: any) => {
        const msg = data as MeshServerMessage;

        switch (msg.type) {
          case 'joined': {
            setStatus('connected');
            setError(null);

            const maxRemote = Math.max(0, maxPeers - 1);
            const existing = msg.peers.slice(0, maxRemote);

            existing.forEach((p) => {
              registerRemotePeer(p.peerId, p.role);
            });

            // new joiner sends offers to existing peers
            existing.forEach((p) => {
              void ensurePeerConnectionRef.current(p.peerId, true);
            });

            if (msg.peers.length > maxRemote) {
              setError(`Mesh mode supports up to ${maxPeers} participants. Extra peers were ignored.`);
            }
            break;
          }

          case 'peer-joined': {
            const currentCount = remotePeersRef.current.size;
            const maxRemote = Math.max(0, maxPeers - 1);

            if (currentCount >= maxRemote) {
              setError(`Mesh mode supports up to ${maxPeers} participants. Extra peers were ignored.`);
              return;
            }

            registerRemotePeer(msg.peerId, msg.role);

            // Existing peers wait for the new peer to offer (avoids glare)
            break;
          }

          case 'peer-left': {
            closePeerConnection(msg.peerId);
            removeRemotePeer(msg.peerId);
            break;
          }

          case 'signal': {
            if (msg.fromPeerId === peerIdRef.current) return;
            void handleRemoteSignalRef.current(msg.fromPeerId, msg.payload);
            break;
          }

          case 'error': {
            setError(msg.message);
            break;
          }

          default:
            break;
        }
      },
    }
  );

  const sendSignal = useCallback(
    (targetPeerId: string, payload: WebRtcSignalPayload) => {
      const msg: MeshSignalMessage = {
        type: 'signal',
        roomId,
        peerId: peerIdRef.current,
        targetPeerId,
        payload,
      };
      sendJson(msg);
    },
    [roomId, sendJson]
  );

  const addLocalTracks = useCallback(
    (pc: RTCPeerConnection) => {
      if (!localStream) return;
      const senders = pc.getSenders();
      localStream.getTracks().forEach((track) => {
        const already = senders.some((s) => s.track === track);
        if (!already) {
          pc.addTrack(track, localStream);
        }
      });
    },
    [localStream]
  );

  const addScreenTrack = useCallback(
    async (peerId: string, pc: RTCPeerConnection, stream: MediaStream) => {
      const screenTrack = stream.getVideoTracks()[0];
      if (!screenTrack) return;
      const sender = pc.addTrack(screenTrack, stream);
      screenSendersRef.current.set(peerId, sender);
      await renegotiate(peerId, pc);
    },
    []
  );

  const handleRemoteTrack = useCallback(
    (peerId: string, event: RTCTrackEvent) => {
      const track = event.track;
      const stream = event.streams?.[0] ?? null;
      if (!stream) return;

      const prev = remotePeersRef.current.get(peerId) ?? {
        peerId,
        role: peerRolesRef.current.get(peerId) ?? 'guest',
        cameraStream: null,
        screenStream: null,
        cameraStreamId: null,
      };

      if (track.kind === 'audio') {
        prev.cameraStreamId = stream.id;
        prev.cameraStream = stream;
      }

      if (track.kind === 'video') {
        if (prev.cameraStreamId && stream.id === prev.cameraStreamId) {
          prev.cameraStream = stream;
        } else {
          prev.screenStream = stream;
        }

        track.onended = () => {
          const hasLiveVideo = stream.getVideoTracks().some((t) => t.readyState === 'live');
          if (!hasLiveVideo) {
            const current = remotePeersRef.current.get(peerId);
            if (current) {
              current.screenStream = null;
              remotePeersRef.current.set(peerId, current);
              syncRemotePeers();
            }
          }
        };
      }

      remotePeersRef.current.set(peerId, prev);
      syncRemotePeers();
    },
    [syncRemotePeers]
  );

  const ensurePeerConnection = useCallback(
    async (peerId: string, shouldOffer: boolean) => {
      if (pcRef.current.has(peerId)) return;

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        sendSignal(peerId, { kind: 'ice', candidate: event.candidate });
      };

      pc.ontrack = (event) => {
        handleRemoteTrack(peerId, event);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          closePeerConnection(peerId);
          removeRemotePeer(peerId);
        }
      };

      pcRef.current.set(peerId, pc);

      addLocalTracks(pc);

      const hasScreen = !!screenStreamRef.current;
      if (screenStreamRef.current) {
        await addScreenTrack(peerId, pc, screenStreamRef.current);
      }

      const pendingOffer = pendingOfferRef.current.get(peerId);
      if (pendingOffer?.kind === 'offer') {
        pendingOfferRef.current.delete(peerId);
        await handleRemoteSignalRef.current(peerId, pendingOffer);
        return;
      }

      if (shouldOffer && !hasScreen) {
        await renegotiate(peerId, pc);
      }
    },
    [
      addLocalTracks,
      addScreenTrack,
      closePeerConnection,
      handleRemoteTrack,
      removeRemotePeer,
      sendSignal,
    ]
  );

  ensurePeerConnectionRef.current = ensurePeerConnection;

  const flushPendingIce = useCallback(async (peerId: string, pc: RTCPeerConnection) => {
    const queued = pendingIceRef.current.get(peerId) ?? [];
    pendingIceRef.current.set(peerId, []);
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // ignore
      }
    }
  }, []);

  const handleRemoteSignal = useCallback<(fromPeerId: string, payload: WebRtcSignalPayload) => Promise<void>>(
    async (fromPeerId: string, payload: WebRtcSignalPayload) => {
      const maxRemote = Math.max(0, maxPeers - 1);
      if (
        !remotePeersRef.current.has(fromPeerId) &&
        remotePeersRef.current.size >= maxRemote
      ) {
        setError(`Mesh mode supports up to ${maxPeers} participants. Extra peers were ignored.`);
        return;
      }

      if (!remotePeersRef.current.has(fromPeerId)) {
        registerRemotePeer(fromPeerId, 'guest');
      }

      if (!pcRef.current.has(fromPeerId)) {
        if (!localStream) {
          pendingOfferRef.current.set(fromPeerId, payload);
          return;
        }
        await ensurePeerConnectionRef.current(fromPeerId, false);
      }

      const pc = pcRef.current.get(fromPeerId);
      if (!pc) return;

      switch (payload.kind) {
        case 'offer': {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          await flushPendingIce(fromPeerId, pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal(fromPeerId, { kind: 'answer', sdp: answer });
          break;
        }
        case 'answer': {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          await flushPendingIce(fromPeerId, pc);
          break;
        }
        case 'ice': {
          if (!payload.candidate) return;
          if (!pc.remoteDescription) {
            const queued = pendingIceRef.current.get(fromPeerId) ?? [];
            queued.push(payload.candidate);
            pendingIceRef.current.set(fromPeerId, queued);
            return;
          }
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          break;
        }
        default:
          break;
      }
    },
    [flushPendingIce, localStream, sendSignal]
  );

  handleRemoteSignalRef.current = handleRemoteSignal;

  const renegotiate = useCallback(
    async (peerId: string, pc?: RTCPeerConnection) => {
      const connection = pc ?? pcRef.current.get(peerId);
      if (!connection) return;
      try {
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        sendSignal(peerId, { kind: 'offer', sdp: offer });
      } catch {
        // ignore
      }
    },
    [sendSignal]
  );

  const startScreenShare = useCallback(async () => {
    if (isScreenSharing) return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      screenStreamRef.current = stream;
      setIsScreenSharing(true);

      for (const [peerId, pc] of pcRef.current.entries()) {
        await addScreenTrack(peerId, pc, stream);
      }

      const track = stream.getVideoTracks()[0];
      if (track) {
        track.onended = () => {
          void stopScreenShare();
        };
      }
    } catch {
      setError('Screen share failed.');
    }
  }, [addScreenTrack, isScreenSharing]);

  const stopScreenShare = useCallback(async () => {
    const screenStream = screenStreamRef.current;

    for (const [peerId, pc] of pcRef.current.entries()) {
      const sender = screenSendersRef.current.get(peerId);
      if (sender) {
        try {
          pc.removeTrack(sender);
        } catch {
          // ignore
        }
      }
      screenSendersRef.current.delete(peerId);
      await renegotiate(peerId, pc);
    }

    if (screenStream) {
      screenStream.getTracks().forEach((t) => t.stop());
    }
    screenStreamRef.current = null;
    setIsScreenSharing(false);
  }, [renegotiate]);

  const join = useCallback(async () => {
    if (status === 'connecting' || status === 'connected') return;
    setError(null);
    setStatus('connecting');

    try {
      await startLocalMedia();
      connect();
    } catch (err: any) {
      setStatus('error');
      setError(err?.message ?? 'Failed to start local media.');
    }
  }, [connect, startLocalMedia, status]);

  const leave = useCallback(() => {
    if (wsStatus === 'open') {
      const leaveMsg: MeshLeaveMessage = {
        type: 'leave',
        roomId,
        peerId: peerIdRef.current,
      };
      sendJson(leaveMsg);
    }

    disconnect();
    stopLocalMedia();
    void stopScreenShare();
    closeAllPeers();
    setStatus('idle');
  }, [closeAllPeers, disconnect, roomId, sendJson, stopLocalMedia, stopScreenShare, wsStatus]);

  useEffect(() => {
    if (mediaError) {
      setError(mediaError);
    }
  }, [mediaError]);

  useEffect(() => {
    if (!localStream) return;
    const pending = Array.from(pendingOfferRef.current.entries());
    if (pending.length === 0) return;
    pendingOfferRef.current.clear();
    pending.forEach(([peerId, payload]) => {
      void handleRemoteSignalRef.current(peerId, payload);
    });
  }, [localStream]);

  useEffect(() => {
    return () => {
      disconnect();
      stopLocalMedia();
      void stopScreenShare();
      closeAllPeers();
    };
  }, [closeAllPeers, disconnect, stopLocalMedia, stopScreenShare]);

  const localScreenStream = screenStreamRef.current;

  return {
    peerId: peerIdRef.current,
    status,
    error,
    localStream,
    localScreenStream,
    isMicMuted,
    isCameraOff,
    isScreenSharing,
    mediaStatus,
    remotePeers,
    join,
    leave,
    toggleMic,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
  };
}
