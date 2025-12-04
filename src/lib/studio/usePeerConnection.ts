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

type RemoteInfo = {
    peerId: string | null;
};

export function usePeerConnection({ localStream, sendSignal }: UsePeerConnectionArgs) {
    const pcRef = useRef<RTCPeerConnection | null>(null);

    // Remote media
    const remoteStreamRef = useRef<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [remoteInfo, setRemoteInfo] = useState<RemoteInfo>({ peerId: null });

    // Screen sharing state
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const screenStreamRef = useRef<MediaStream | null>(null);
    const screenSenderRef = useRef<RTCRtpSender | null>(null);
    const originalVideoTrackRef = useRef<MediaStreamTrack | null>(null);

    const ensurePeerConnection = useCallback(() => {
        if (pcRef.current) return pcRef.current;

        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                sendSignal({ kind: 'ice', candidate: event.candidate }, remoteInfo.peerId || undefined);
            }
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
    }, [remoteInfo.peerId, sendSignal]);

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

    // Whenever the base localStream (camera/mic) changes, add any new tracks
    useEffect(() => {
        if (!localStream) return;
        const pc = pcRef.current;
        if (!pc) return;
        addLocalTracks(pc);
    }, [localStream, addLocalTracks]);

    const startCall = useCallback(
        async (targetPeerId: string) => {
            setRemoteInfo({ peerId: targetPeerId });

            const pc = ensurePeerConnection();
            // Will no-op if localStream is still null; once it exists, effect above will add tracks
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
                    setRemoteInfo({ peerId: fromPeerId });

                    addLocalTracks(pc);

                    await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);

                    sendSignal({ kind: 'answer', sdp: answer }, fromPeerId);
                    break;
                }
                case 'answer': {
                    console.log('[webrtc] received answer from', fromPeerId);
                    await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                    break;
                }
                case 'ice': {
                    if (payload.candidate) {
                        try {
                            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
                        } catch (err) {
                            console.error('[webrtc] failed to add ICE candidate', err);
                        }
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
            const senders = pc.getSenders();
            let videoSender = senders.find((s) => s.track && s.track.kind === 'video') || null;

            if (videoSender && videoSender.track) {
                originalVideoTrackRef.current = videoSender.track;
                screenSenderRef.current = videoSender;
                await videoSender.replaceTrack(screenTrack);
            } else {
                // no video sender yet — just add the track
                pc.addTrack(screenTrack, stream);
            }

            screenStreamRef.current = stream;
            setIsScreenSharing(true);

            screenTrack.onended = () => {
                // user pressed "Stop sharing" from browser UI
                console.log('[webrtc] displayMedia track ended');
                setTimeout(() => {
                    // small timeout so browser finishes its own cleanup first
                    stopScreenShare();
                }, 0);
            };
        } catch (err) {
            console.error('[webrtc] startScreenShare error', err);
        }
    }, [ensurePeerConnection, isScreenSharing]);

    const stopScreenShare = useCallback(() => {
        if (!isScreenSharing) return;

        const pc = pcRef.current;
        const sender = screenSenderRef.current;
        const originalTrack = originalVideoTrackRef.current;

        if (sender && originalTrack) {
            sender
                .replaceTrack(originalTrack)
                .catch((err) => console.error('[webrtc] failed to restore camera track', err));
        }

        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach((t) => t.stop());
            screenStreamRef.current = null;
        }

        screenSenderRef.current = null;
        originalVideoTrackRef.current = null;
        setIsScreenSharing(false);
    }, [isScreenSharing]);

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
        setIsScreenSharing(false);

        setRemoteStream(null);
        setRemoteInfo({ peerId: null });
    }, []);

    return {
        remoteStream,
        remotePeerId: remoteInfo.peerId,

        startCall,
        handleRemoteSignal,
        closeConnection,

        // screen share API
        isScreenSharing,
        startScreenShare,
        stopScreenShare,
    };
}
