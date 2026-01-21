'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type WebRtcSignalPayload =
    | { kind: 'offer'; sdp: RTCSessionDescriptionInit }
    | { kind: 'answer'; sdp: RTCSessionDescriptionInit }
    | { kind: 'ice'; candidate: RTCIceCandidateInit };

type UsePeerConnectionArgs = {
    localStream: MediaStream | null; // camera + mic
    sendSignal: (payload: WebRtcSignalPayload, targetPeerId?: string) => void;
};

export function usePeerConnection({ localStream, sendSignal }: UsePeerConnectionArgs) {
    const pcRef = useRef<RTCPeerConnection | null>(null);

    // If an offer arrives before local media is ready, we stash it and answer later.
    const pendingOfferRef = useRef<{ fromPeerId: string; payload: WebRtcSignalPayload } | null>(
        null
    );

    const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);

    // Remote camera stream (video+audio) and remote screen stream (video)
    const remoteCameraStreamRef = useRef<MediaStream | null>(null);
    const remoteScreenStreamRef = useRef<MediaStream | null>(null);

    const [remoteCameraStream, setRemoteCameraStream] = useState<MediaStream | null>(null);
    const [remoteScreenStream, setRemoteScreenStream] = useState<MediaStream | null>(null);

    // NEW: stream-id based routing (no ordering assumptions)
    const remoteCameraStreamIdRef = useRef<string | null>(null);

    // Remote peer id (state + ref)
    const [remotePeerId, setRemotePeerIdState] = useState<string | null>(null);
    const remotePeerIdRef = useRef<string | null>(null);
    const setRemotePeerId = (id: string | null) => {
        remotePeerIdRef.current = id;
        setRemotePeerIdState(id);
    };

    // Screen sharing state
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [screenPreviewStream, setScreenPreviewStream] = useState<MediaStream | null>(null);
    const screenStreamRef = useRef<MediaStream | null>(null);
    const screenSenderRef = useRef<RTCRtpSender | null>(null);

    const flushPendingIce = useCallback(async (pc: RTCPeerConnection) => {
        const queued = pendingIceRef.current;
        pendingIceRef.current = [];
        for (const c of queued) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(c));
            } catch (e) {
                console.error('[webrtc] failed to add queued ICE', e);
            }
        }
    }, []);

    const ensurePeerConnection = useCallback(() => {
        if (pcRef.current) return pcRef.current;

        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });

        pc.onicecandidate = (event) => {
            if (!event.candidate) return;
            const targetPeerId = remotePeerIdRef.current;
            if (!targetPeerId) return;

            sendSignal({ kind: 'ice', candidate: event.candidate }, targetPeerId);
        };

        pc.ontrack = (event) => {
            const track = event.track;
            const stream = event.streams?.[0] ?? null; // should exist because you addTrack(track, stream)

            // If for any reason stream is missing, fall back to a safe behavior
            // (but you should not hit this in your current code).
            if (!stream) {
                console.warn('[webrtc] ontrack missing event.streams[0]; track kind=', track.kind);
                return;
            }

            // AUDIO => defines "camera stream"
            if (track.kind === 'audio') {
                remoteCameraStreamIdRef.current = stream.id;

                remoteCameraStreamRef.current = stream;
                setRemoteCameraStream(stream);

                // cleanup when remote stops audio
                track.onended = () => {
                    // If audio ends, we still keep the camera stream if video remains.
                    // But camera stream id is still the best identifier.
                };

                return;
            }

            // VIDEO => classify by which stream id it belongs to
            if (track.kind === 'video') {
                const cameraStreamId = remoteCameraStreamIdRef.current;

                // If this video belongs to the stream that has audio => camera video
                if (cameraStreamId && stream.id === cameraStreamId) {
                    remoteCameraStreamRef.current = stream;
                    setRemoteCameraStream(stream);

                    track.onended = () => {
                        // If camera video ends, we keep stream object but UI will show black.
                        // Optionally you can setRemoteCameraStream(null) if no video tracks remain.
                    };

                    return;
                }

                // Otherwise => screen share stream
                remoteScreenStreamRef.current = stream;
                setRemoteScreenStream(stream);

                track.onended = () => {
                    // When screen share stops remotely, clear the screen stream for UI
                    // (If stream still has other live tracks, keep it)
                    const hasLiveVideo = stream.getVideoTracks().some((t) => t.readyState === 'live');
                    if (!hasLiveVideo) {
                        remoteScreenStreamRef.current = null;
                        setRemoteScreenStream(null);
                    }
                };

                return;
            }
        };

        pc.onconnectionstatechange = () => {
            console.log('[webrtc] connection state', pc.connectionState);
        };

        pcRef.current = pc;
        return pc;
    }, [sendSignal]);

    const addLocalTracks = useCallback(
        (pc: RTCPeerConnection) => {
            if (!localStream) return;

            const senders = pc.getSenders();

            localStream.getTracks().forEach((track) => {
                const alreadySending = senders.some((s) => s.track === track);
                if (!alreadySending) {
                    pc.addTrack(track, localStream);
                }
            });
        },
        [localStream]
    );

    // Whenever localStream changes, make sure tracks are on the PC
    useEffect(() => {
        if (!localStream) return;
        const pc = pcRef.current;
        if (!pc) return;
        addLocalTracks(pc);
    }, [localStream, addLocalTracks]);

    const startCall = useCallback(
        async (targetPeerId: string) => {
            if (!localStream) {
                console.warn('[webrtc] startCall called but localStream is null; not creating offer');
                return;
            }

            setRemotePeerId(targetPeerId);

            const pc = ensurePeerConnection();
            addLocalTracks(pc);

            console.log('[webrtc] creating offer to', targetPeerId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            sendSignal({ kind: 'offer', sdp: offer }, targetPeerId);
        },
        [localStream, addLocalTracks, ensurePeerConnection, sendSignal]
    );

    const handleRemoteSignal = useCallback(
        async (fromPeerId: string, payload: WebRtcSignalPayload) => {
            const pc = ensurePeerConnection();

            switch (payload.kind) {
                case 'offer': {
                    console.log('[webrtc] received offer from', fromPeerId);

                    if (!localStream) {
                        console.warn('[webrtc] offer received before localStream ready; deferring');
                        pendingOfferRef.current = { fromPeerId, payload };
                        setRemotePeerId(fromPeerId);
                        return;
                    }

                    setRemotePeerId(fromPeerId);
                    addLocalTracks(pc);

                    await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                    await flushPendingIce(pc);

                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);

                    sendSignal({ kind: 'answer', sdp: answer }, fromPeerId);
                    break;
                }

                case 'answer': {
                    console.log('[webrtc] received answer from', fromPeerId);
                    if (pc.signalingState !== 'have-local-offer') {
                        console.warn('[webrtc] ignoring answer because signalingState is', pc.signalingState);
                        return;
                    }

                    await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                    await flushPendingIce(pc);
                    break;
                }

                case 'ice': {
                    if (!payload.candidate) return;

                    if (!pc.remoteDescription) {
                        pendingIceRef.current.push(payload.candidate);
                        return;
                    }

                    try {
                        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
                    } catch (err) {
                        console.error('[webrtc] failed to add ICE candidate', err);
                    }
                    break;
                }

                default: {
                    console.warn('[webrtc] unknown signal kind', payload);
                }
            }
        },
        [addLocalTracks, ensurePeerConnection, sendSignal, localStream, flushPendingIce]
    );

    // When localStream becomes ready, answer any offer that came in earlier.
    useEffect(() => {
        if (!localStream) return;
        const pending = pendingOfferRef.current;
        if (!pending) return;

        pendingOfferRef.current = null;
        handleRemoteSignal(pending.fromPeerId, pending.payload);
    }, [localStream, handleRemoteSignal]);

    const renegotiate = useCallback(async () => {
        const pc = pcRef.current;
        const targetPeerId = remotePeerIdRef.current;

        if (!pc || !targetPeerId) {
            console.warn('[webrtc] renegotiate skipped (pc or targetPeerId missing)');
            return;
        }

        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendSignal({ kind: 'offer', sdp: offer }, targetPeerId);
        } catch (e) {
            console.error('[webrtc] renegotiate failed', e);
        }
    }, [sendSignal]);

    const stopScreenShare = useCallback(async () => {
        const pc = pcRef.current;
        const sender = screenSenderRef.current;
        const screenStream = screenStreamRef.current;

        try {
            if (pc && sender) {
                pc.removeTrack(sender);
                screenSenderRef.current = null;
                await renegotiate();
            }
        } catch (err) {
            console.error('[webrtc] stopScreenShare failed', err);
        }

        if (screenStream) {
            screenStream.getTracks().forEach((t) => t.stop());
            screenStreamRef.current = null;
        }

        setScreenPreviewStream(null);
        setIsScreenSharing(false);
    }, [renegotiate]);

    const startScreenShare = useCallback(async () => {
        if (isScreenSharing) return;

        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false,
            });

            const screenTrack = stream.getVideoTracks()[0];
            if (!screenTrack) {
                stream.getTracks().forEach((t) => t.stop());
                return;
            }

            const pc = ensurePeerConnection();

            // keep camera/mic senders
            addLocalTracks(pc);

            // add screen as second sender
            const sender = pc.addTrack(screenTrack, stream);
            screenSenderRef.current = sender;

            screenStreamRef.current = stream;
            setScreenPreviewStream(stream);
            setIsScreenSharing(true);

            await renegotiate();

            screenTrack.onended = () => {
                setTimeout(() => stopScreenShare(), 0);
            };
        } catch (err) {
            console.error('[webrtc] startScreenShare error', err);
        }
    }, [addLocalTracks, ensurePeerConnection, isScreenSharing, renegotiate, stopScreenShare]);

    const closeConnection = useCallback(() => {
        // stop local screen share
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach((t) => t.stop());
            screenStreamRef.current = null;
        }
        screenSenderRef.current = null;
        setScreenPreviewStream(null);
        setIsScreenSharing(false);

        if (pcRef.current) {
            try {
                pcRef.current.onicecandidate = null;
                pcRef.current.ontrack = null;
                pcRef.current.onconnectionstatechange = null;
                pcRef.current.close();
            } catch {
                /* ignore */
            }
            pcRef.current = null;
        }

        // do NOT stop remote tracks here (they are owned by remote). Just clear UI state.
        remoteCameraStreamRef.current = null;
        remoteScreenStreamRef.current = null;
        remoteCameraStreamIdRef.current = null;

        setRemoteCameraStream(null);
        setRemoteScreenStream(null);

        setRemotePeerId(null);
        pendingOfferRef.current = null;
        pendingIceRef.current = [];
    }, []);

    return {
        remoteCameraStream,
        remoteScreenStream,
        remotePeerId,
        startCall,
        handleRemoteSignal,
        closeConnection,
        isScreenSharing,
        screenPreviewStream,
        startScreenShare,
        stopScreenShare,
    };
}
