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

    // Remote media
    // const remoteStreamRef = useRef<MediaStream | null>(null);
    // const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

    // Remote camera stream (video+audio) and remote screen stream (video)
    const remoteCameraStreamRef = useRef<MediaStream | null>(null);
    const remoteScreenStreamRef = useRef<MediaStream | null>(null);

    const [remoteCameraStream, setRemoteCameraStream] = useState<MediaStream | null>(null);
    const [remoteScreenStream, setRemoteScreenStream] = useState<MediaStream | null>(null);

    // video track counter
    const remoteVideoTrackCountRef = useRef<number>(0);

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

    // If we replaced the camera track, we store it here to restore on stop.
    // const originalVideoTrackRef = useRef<MediaStreamTrack | null>(null);

    // If we had to ADD a new sender (because no video sender existed), we’ll remove it on stop.
    // const addedScreenSenderRef = useRef<boolean>(false);

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

        // pc.ontrack = (event) => {
        //     let rs = remoteStreamRef.current;
        //     if (!rs) {
        //         rs = new MediaStream();
        //         remoteStreamRef.current = rs;
        //     }
        //     if (!rs.getTracks().includes(event.track)) {
        //         rs.addTrack(event.track);
        //     }
        //     setRemoteStream(rs);
        // };

        pc.ontrack = (event) => {
            const track = event.track;

            // Audio always belongs to camera stream
            if (track.kind === 'audio') {
                let cam = remoteCameraStreamRef.current;
                if (!cam) {
                    cam = new MediaStream();
                    remoteCameraStreamRef.current = cam;
                }
                if (!cam.getTracks().includes(track)) {
                    cam.addTrack(track);
                }
                setRemoteCameraStream(cam);
                return;
            }

            // Video: first video track -> camera, second video track -> screen
            if (track.kind === 'video') {
                remoteVideoTrackCountRef.current += 1;
                const isFirstVideo = remoteVideoTrackCountRef.current === 1;

                if (isFirstVideo) {
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

            const senders = pc
                .getSenders()
                .map((s) => s.track?.kind)
                .filter(Boolean);
            console.log('[webrtc] senders after addLocalTracks:', senders);

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

                    // If local media not ready, defer answering (this is key for “host can’t see guest” issues)
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
                    // Only apply answer when we have a local offer outstanding
                    if (pc.signalingState !== 'have-local-offer') {
                        console.warn('[webrtc] ignoring answer because signalingState is', pc.signalingState);
                        return;
                    }
                    await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                    await flushPendingIce(pc);

                    break;
                }

                // case 'ice': {
                //     if (!payload.candidate) return;
                //     try {
                //         await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
                //     } catch (err) {
                //         console.error('[webrtc] failed to add ICE candidate', err);
                //     }
                //     break;
                // }

                case 'ice': {
                    if (!payload.candidate) return;

                    // If we don't yet have a remoteDescription, queue ICE.
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
        [addLocalTracks, ensurePeerConnection, sendSignal, localStream]
    );

    // When localStream becomes ready, answer any offer that came in earlier.
    useEffect(() => {
        if (!localStream) return;
        const pending = pendingOfferRef.current;
        if (!pending) return;

        pendingOfferRef.current = null;
        handleRemoteSignal(pending.fromPeerId, pending.payload);
    }, [localStream, handleRemoteSignal]);

    // --- Screen share ---

    const renegotiate = useCallback(async () => {
        const pc = pcRef.current;
        const targetPeerId = remotePeerIdRef.current;

        if (!pc || !targetPeerId) {
            console.warn('[webrtc] renegotiate skipped (pc or targetPeerId missing)');
            return;
        }

        try {
            // createOffer() here is used when we ADD/REMOVE tracks (not for replaceTrack)
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendSignal({ kind: 'offer', sdp: offer }, targetPeerId);
        } catch (e) {
            console.error('[webrtc] renegotiate failed', e);
        }
    }, [sendSignal]);

    // const stopScreenShare = useCallback(async () => {
    //     const pc = pcRef.current;
    //     const sender = screenSenderRef.current;
    //     const originalTrack = originalVideoTrackRef.current;
    //     const screenStream = screenStreamRef.current;

    //     try {
    //         if (pc && sender) {
    //             if (originalTrack) {
    //                 // We replaced camera → restore camera
    //                 await sender.replaceTrack(originalTrack);
    //             } else if (addedScreenSenderRef.current) {
    //                 // We added a new sender for screen → remove it
    //                 pc.removeTrack(sender);
    //                 await renegotiate();
    //             }
    //         }
    //     } catch (err) {
    //         console.error('[webrtc] stopScreenShare failed', err);
    //     }

    //     if (screenStream) {
    //         screenStream.getTracks().forEach((t) => t.stop());
    //         screenStreamRef.current = null;
    //     }

    //     screenSenderRef.current = null;
    //     originalVideoTrackRef.current = null;
    //     addedScreenSenderRef.current = false;

    //     setScreenPreviewStream(null);
    //     setIsScreenSharing(false);
    // }, [renegotiate]);

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

    // const startScreenShare = useCallback(async () => {
    //     if (isScreenSharing) return;

    //     try {
    //         const stream = await navigator.mediaDevices.getDisplayMedia({
    //             video: true,
    //             audio: false,
    //         });

    //         const screenTrack = stream.getVideoTracks()[0];
    //         if (!screenTrack) {
    //             console.warn('[webrtc] displayMedia returned no video track');
    //             stream.getTracks().forEach((t) => t.stop());
    //             return;
    //         }

    //         const pc = ensurePeerConnection();

    //         // Ensure local tracks exist first (so getSenders has a camera sender in the common case)
    //         addLocalTracks(pc);

    //         // Prefer replacing an existing video sender (camera)
    //         const existingVideoSender =
    //             pc.getSenders().find((s) => s.track && s.track.kind === 'video') || null;

    //         if (existingVideoSender && existingVideoSender.track) {
    //             console.log('[webrtc] screenShare using replaceTrack');
    //             originalVideoTrackRef.current = existingVideoSender.track;
    //             screenSenderRef.current = existingVideoSender;
    //             addedScreenSenderRef.current = false;

    //             await existingVideoSender.replaceTrack(screenTrack);
    //         } else {
    //             // Fallback: no video sender exists yet. Add screen track and renegotiate.
    //             console.warn('[webrtc] no video sender; adding screen track and renegotiating');
    //             const sender = pc.addTrack(screenTrack, stream);
    //             screenSenderRef.current = sender;
    //             originalVideoTrackRef.current = null;
    //             addedScreenSenderRef.current = true;

    //             await renegotiate();
    //         }

    //         screenStreamRef.current = stream;
    //         setScreenPreviewStream(stream);
    //         setIsScreenSharing(true);

    //         // When user stops sharing from browser UI, auto-restore
    //         screenTrack.onended = () => {
    //             console.log('[webrtc] displayMedia track ended');
    //             setTimeout(() => {
    //                 stopScreenShare();
    //             }, 0);
    //         };
    //     } catch (err) {
    //         console.error('[webrtc] startScreenShare error', err);
    //     }
    // }, [addLocalTracks, ensurePeerConnection, isScreenSharing, renegotiate, stopScreenShare]);

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

            // Ensure camera/mic tracks are present FIRST (so we keep camera + screen together)
            addLocalTracks(pc);

            // ADD screen as a second track (Meet style)
            const sender = pc.addTrack(screenTrack, stream);
            screenSenderRef.current = sender;

            screenStreamRef.current = stream;
            setScreenPreviewStream(stream);
            setIsScreenSharing(true);

            // renegotiate so the remote gets the new track
            await renegotiate();

            screenTrack.onended = () => {
                setTimeout(() => stopScreenShare(), 0);
            };
        } catch (err) {
            console.error('[webrtc] startScreenShare error', err);
        }
    }, [addLocalTracks, ensurePeerConnection, isScreenSharing, renegotiate, stopScreenShare]);


    const closeConnection = useCallback(() => {
        // stop screen share cleanly
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach((t) => t.stop());
            screenStreamRef.current = null;
        }
        screenSenderRef.current = null;
        // originalVideoTrackRef.current = null;
        // addedScreenSenderRef.current = false;
        setScreenPreviewStream(null);
        setIsScreenSharing(false);

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

        if (remoteCameraStreamRef.current) {
            remoteCameraStreamRef.current.getTracks().forEach((t) => t.stop());
            remoteCameraStreamRef.current = null;
        }
        if (remoteScreenStreamRef.current) {
            remoteScreenStreamRef.current.getTracks().forEach((t) => t.stop());
            remoteScreenStreamRef.current = null;
        }

        remoteVideoTrackCountRef.current = 0;

        setRemoteCameraStream(null);
        setRemoteScreenStream(null);

        setRemotePeerId(null);
        pendingOfferRef.current = null;
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