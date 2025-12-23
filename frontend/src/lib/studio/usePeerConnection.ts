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

    // Remote media
    const remoteStreamRef = useRef<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

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
    const originalVideoTrackRef = useRef<MediaStreamTrack | null>(null);

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
            let rs = remoteStreamRef.current;
            if (!rs) {
                rs = new MediaStream();
                remoteStreamRef.current = rs;
            }
            if (!rs.getTracks().includes(event.track)) {
                rs.addTrack(event.track);
            }
            setRemoteStream(rs);
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
            setRemotePeerId(targetPeerId);

            const pc = ensurePeerConnection();
            addLocalTracks(pc);

            console.log('[webrtc] creating offer to', targetPeerId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            sendSignal({ kind: 'offer', sdp: offer }, targetPeerId);
        },
        [addLocalTracks, ensurePeerConnection, sendSignal]
    );

    const handleRemoteSignal = useCallback(
        async (fromPeerId: string, payload: WebRtcSignalPayload) => {
            const pc = ensurePeerConnection();

            switch (payload.kind) {
                case 'offer': {
                    console.log('[webrtc] received offer from', fromPeerId);
                    setRemotePeerId(fromPeerId);

                    addLocalTracks(pc);

                    await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);

                    sendSignal({ kind: 'answer', sdp: answer }, fromPeerId);
                    break;
                }

                case 'answer': {
                    console.log('[webrtc] received answer from', fromPeerId);
                    // Only apply answer when we have a local offer outstanding
                    if (pc.signalingState !== 'have-local-offer') {
                        console.warn(
                            '[webrtc] ignoring answer because signalingState is',
                            pc.signalingState
                        );
                        return;
                    }
                    await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                    break;
                }

                case 'ice': {
                    if (!payload.candidate) return;
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
        [addLocalTracks, ensurePeerConnection, sendSignal]
    );

    // --- Screen share: replaceTrack-only implementation ---

    const stopScreenShare = useCallback(() => {
        const pc = pcRef.current;
        const sender = screenSenderRef.current;
        const originalTrack = originalVideoTrackRef.current;
        const screenStream = screenStreamRef.current;

        if (pc && sender && originalTrack) {
            sender
                .replaceTrack(originalTrack)
                .catch((err) =>
                    console.error('[webrtc] failed to restore camera track', err)
                );
        }

        if (screenStream) {
            screenStream.getTracks().forEach((t) => t.stop());
            screenStreamRef.current = null;
        }

        screenSenderRef.current = null;
        originalVideoTrackRef.current = null;
        setScreenPreviewStream(null);
        setIsScreenSharing(false);
    }, []);

    const startScreenShare = useCallback(async () => {
        if (isScreenSharing) return;

        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false,
            });

            const screenTrack = stream.getVideoTracks()[0];
            if (!screenTrack) {
                console.warn('[webrtc] displayMedia returned no video track');
                stream.getTracks().forEach((t) => t.stop());
                return;
            }

            const pc = ensurePeerConnection();

            // Find existing video sender (camera)
            const sender =
                pc
                    .getSenders()
                    .find((s) => s.track && s.track.kind === 'video') || null;

            if (!sender || !sender.track) {
                console.warn('[webrtc] no video sender to replace for screen share');
                stream.getTracks().forEach((t) => t.stop());
                return;
            }

            console.log('[webrtc] screenShare using replaceTrack');
            originalVideoTrackRef.current = sender.track;
            screenSenderRef.current = sender;

            await sender.replaceTrack(screenTrack);

            screenStreamRef.current = stream;
            setScreenPreviewStream(stream);
            setIsScreenSharing(true);

            screenTrack.onended = () => {
                console.log('[webrtc] displayMedia track ended');
                setTimeout(() => {
                    stopScreenShare();
                }, 0);
            };
        } catch (err) {
            console.error('[webrtc] startScreenShare error', err);
        }
    }, [ensurePeerConnection, isScreenSharing, stopScreenShare]);

    const closeConnection = useCallback(() => {
        if (pcRef.current) {
            try {
                pcRef.current.close();
            } catch {
                // ignore
            }
            pcRef.current = null;
        }

        if (remoteStreamRef.current) {
            remoteStreamRef.current.getTracks().forEach((t) => t.stop());
            remoteStreamRef.current = null;
        }

        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach((t) => t.stop());
            screenStreamRef.current = null;
        }

        screenSenderRef.current = null;
        originalVideoTrackRef.current = null;
        setScreenPreviewStream(null);
        setIsScreenSharing(false);

        setRemoteStream(null);
        setRemotePeerId(null);
    }, []);

    return {
        remoteStream,
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
