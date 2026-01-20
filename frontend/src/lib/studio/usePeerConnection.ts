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

    // If an offer arrives before local media is ready, stash and answer later.
    const pendingOfferRef = useRef<{ fromPeerId: string; payload: WebRtcSignalPayload } | null>(
        null
    );

    // Remote streams (camera+audio) and (screen video)
    const remoteCameraStreamRef = useRef<MediaStream | null>(null);
    const remoteScreenStreamRef = useRef<MediaStream | null>(null);

    const [remoteCameraStream, setRemoteCameraStream] = useState<MediaStream | null>(null);
    const [remoteScreenStream, setRemoteScreenStream] = useState<MediaStream | null>(null);

    // We classify by “which incoming stream is the camera stream”
    // We choose the stream that carries the remote audio track as the camera stream.
    const remoteCameraStreamIdRef = useRef<string | null>(null);
    const firstVideoSeenRef = useRef<boolean>(false);

    // Remote peer id (state + ref)
    const [remotePeerId, setRemotePeerIdState] = useState<string | null>(null);
    const remotePeerIdRef = useRef<string | null>(null);
    const setRemotePeerId = (id: string | null) => {
        remotePeerIdRef.current = id;
        setRemotePeerIdState(id);
    };

    // Screen sharing state (local)
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [screenPreviewStream, setScreenPreviewStream] = useState<MediaStream | null>(null);
    const screenStreamRef = useRef<MediaStream | null>(null);
    const screenSenderRef = useRef<RTCRtpSender | null>(null);

    const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);

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

        const removeTrackFromStream = (
            streamRef: React.MutableRefObject<MediaStream | null>,
            setStream: (s: MediaStream | null) => void,
            track: MediaStreamTrack
        ) => {
            const s = streamRef.current;
            if (!s) return;

            try {
                if (s.getTracks().includes(track)) {
                    s.removeTrack(track);
                }
            } catch {
                // ignore
            }

            if (s.getTracks().length === 0) {
                streamRef.current = null;
                setStream(null);
            } else {
                // new object reference not required; but set state to keep UI consistent
                setStream(s);
            }
        };

        pc.ontrack = (event) => {
            const track = event.track;
            const inboundStream = event.streams?.[0] ?? null;
            const inboundStreamId = inboundStream?.id ?? null;

            // When a track ends (remote stops screen share / leaves), clear it from state.
            track.onended = () => {
                // Decide which stream it belonged to at render time:
                const camId = remoteCameraStreamIdRef.current;

                if (track.kind === 'audio') {
                    removeTrackFromStream(remoteCameraStreamRef, setRemoteCameraStream, track);
                    return;
                }

                if (track.kind === 'video') {
                    if (camId && inboundStreamId === camId) {
                        removeTrackFromStream(remoteCameraStreamRef, setRemoteCameraStream, track);
                    } else {
                        removeTrackFromStream(remoteScreenStreamRef, setRemoteScreenStream, track);
                    }
                }
            };

            // AUDIO: always camera stream; also sets cameraStreamId for robust video classification
            if (track.kind === 'audio') {
                let cam = remoteCameraStreamRef.current;
                if (!cam) {
                    cam = new MediaStream();
                    remoteCameraStreamRef.current = cam;
                }

                if (!cam.getTracks().includes(track)) {
                    cam.addTrack(track);
                }

                if (inboundStreamId) {
                    remoteCameraStreamIdRef.current = inboundStreamId;
                }

                setRemoteCameraStream(cam);
                return;
            }

            // VIDEO: classify by inbound stream id (preferred), with a safe fallback
            if (track.kind === 'video') {
                const camId = remoteCameraStreamIdRef.current;

                const shouldTreatAsCamera =
                    (camId && inboundStreamId === camId) ||
                    // fallback if audio never shows up: first video becomes camera
                    (!camId && !firstVideoSeenRef.current);

                if (!camId && !firstVideoSeenRef.current) {
                    firstVideoSeenRef.current = true;
                }

                if (shouldTreatAsCamera) {
                    let cam = remoteCameraStreamRef.current;
                    if (!cam) {
                        cam = new MediaStream();
                        remoteCameraStreamRef.current = cam;
                    }
                    if (!cam.getTracks().includes(track)) {
                        cam.addTrack(track);
                    }
                    setRemoteCameraStream(cam);
                } else {
                    let screen = remoteScreenStreamRef.current;
                    if (!screen) {
                        screen = new MediaStream();
                        remoteScreenStreamRef.current = screen;
                    }
                    if (!screen.getTracks().includes(track)) {
                        screen.addTrack(track);
                    }
                    setRemoteScreenStream(screen);
                }
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

    // Whenever localStream changes, ensure tracks are on the PC
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

    // Renegotiate when we add/remove tracks (screen share)
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

            // Keep camera+mic intact
            addLocalTracks(pc);

            // Add screen as second outgoing video track
            const sender = pc.addTrack(screenTrack, stream);
            screenSenderRef.current = sender;

            screenStreamRef.current = stream;
            setScreenPreviewStream(stream);
            setIsScreenSharing(true);

            // Remote must learn about new track
            await renegotiate();

            screenTrack.onended = () => {
                setTimeout(() => stopScreenShare(), 0);
            };
        } catch (err) {
            console.error('[webrtc] startScreenShare error', err);
        }
    }, [addLocalTracks, ensurePeerConnection, isScreenSharing, renegotiate, stopScreenShare]);

    const closeConnection = useCallback(() => {
        // Local screen share cleanup
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach((t) => t.stop());
            screenStreamRef.current = null;
        }
        screenSenderRef.current = null;
        setScreenPreviewStream(null);
        setIsScreenSharing(false);

        // Close PC
        if (pcRef.current) {
            try {
                pcRef.current.onicecandidate = null;
                pcRef.current.ontrack = null;
                pcRef.current.onconnectionstatechange = null;
                pcRef.current.close();
            } catch {
                // ignore
            }
            pcRef.current = null;
        }

        // Clear remote streams (do NOT rely on track order next time)
        remoteCameraStreamRef.current = null;
        remoteScreenStreamRef.current = null;
        remoteCameraStreamIdRef.current = null;
        firstVideoSeenRef.current = false;

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
