'use client';

import React, { use, useEffect, useRef, useState } from 'react';
import { useWebSocketConnection } from '@/lib/studio/useWebSocketConnection';
import { useLocalMedia } from '@/lib/studio/useLocalMedia';
import { usePeerConnection } from '@/lib/studio/usePeerConnection';

type Role = 'host' | 'guest';

type RouteParams = {
    recordingId: string;
};

type StudioPageProps = {
    params: Promise<RouteParams>;
};

type StudioPeerSummary = {
    peerId: string;
    role: Role;
};

type JoinedMessage = {
    type: 'joined';
    roomId: string;
    peerId: string;
    role: Role;
    peers: StudioPeerSummary[];
};

type PeerJoinedMessage = {
    type: 'peer-joined';
    roomId: string;
    peerId: string;
    role: Role;
};

type PeerLeftMessage = {
    type: 'peer-left';
    roomId: string;
    peerId: string;
};

type SignalMessage = {
    type: 'signal';
    roomId: string;
    fromPeerId: string;
    payload: any;
};

type ErrorMessage = {
    type: 'error';
    roomId?: string;
    message: string;
};

type ServerMessage =
    | JoinedMessage
    | PeerJoinedMessage
    | PeerLeftMessage
    | SignalMessage
    | ErrorMessage;

export default function StudioRecordingPage({ params }: StudioPageProps) {
    const { recordingId } = use(params);

    const [role, setRole] = useState<Role>('host');
    const [peers, setPeers] = useState<StudioPeerSummary[]>([]);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<
        'idle' | 'connecting' | 'connected'
    >('idle');

    // peerId is only created on the client
    const [peerId, setPeerId] = useState<string | null>(null);

    useEffect(() => {
        if (peerId) return;
        let id: string;
        if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
            id = crypto.randomUUID();
        } else {
            id = `peer-${Math.random().toString(36).slice(2)}`;
        }
        setPeerId(id);
    }, [peerId]);

    // Local media (camera + mic)
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

    const localVideoRef = useRef<HTMLVideoElement | null>(null);
    const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
    const screenPreviewRef = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
        const videoEl = localVideoRef.current;
        if (!videoEl) return;

        if (localStream) {
            videoEl.srcObject = localStream;
        } else {
            videoEl.srcObject = null;
        }
    }, [localStream]);

    // WebSocket signaling
    const { status: wsStatus, connect, disconnect, sendJson } =
        useWebSocketConnection('/v1/studio/signaling', {
            onOpen: () => {
                setConnectionStatus('connecting');
                setErrorMessage(null);

                if (!peerId) return;

                sendJson({
                    type: 'join',
                    roomId: recordingId,
                    peerId,
                    role,
                });
            },
            onMessage: (data: any) => {
                const msg = data as ServerMessage;
                switch (msg.type) {
                    case 'joined': {
                        setConnectionStatus('connected');
                        setErrorMessage(null);
                        setPeers(msg.peers);

                        // If I'm Host and someone is already there, start call to first peer
                        // if (role === 'host' && msg.peers.length > 0 && peerId) {
                        //     const firstPeer = msg.peers[0];
                        //     console.log('[studio] host starting call to', firstPeer.peerId);
                        //     startCall(firstPeer.peerId);
                        // }
                        if (role === 'host' && msg.peers.length > 0 && peerId) {
                            const firstPeer = msg.peers[0];
                            console.log('[studio] host will start call to', firstPeer.peerId, '(pending)');
                            setPendingCallPeerId(firstPeer.peerId);
                        }

                        break;
                    }
                    case 'peer-joined': {
                        setPeers((prev) => {
                            if (prev.some((p) => p.peerId === msg.peerId)) return prev;
                            return [...prev, { peerId: msg.peerId, role: msg.role }];
                        });

                        // If I'm Host and I see a new peer join, start call if not already connected
                        // if (
                        //     role === 'host' &&
                        //     !remotePeerId &&
                        //     peerId &&
                        //     msg.peerId !== peerId
                        // ) {
                        //     console.log(
                        //         '[studio] host starting call to newly joined peer',
                        //         msg.peerId,
                        //     );
                        //     startCall(msg.peerId);
                        // }

                        if (role === 'host' && !remotePeerId && peerId && msg.peerId !== peerId) {
                            console.log('[studio] host will start call to newly joined peer', msg.peerId, '(pending)');
                            setPendingCallPeerId(msg.peerId);
                        }

                        break;
                    }
                    case 'peer-left': {
                        setPeers((prev) => prev.filter((p) => p.peerId !== msg.peerId));
                        if (msg.peerId === remotePeerId) {
                            console.log('[studio] remote peer left; closing webrtc', msg.peerId);
                            closeConnection(); // clears remoteStream + remotePeerId + closes PC
                        }
                        break;
                    }
                    case 'signal': {
                        if (msg.fromPeerId === peerId) {
                            // This is a signal we originated; ignore if the server echoes it back
                            return;
                        }
                        handleRemoteSignal(msg.fromPeerId, msg.payload);
                        break;
                    }

                    case 'error': {
                        setErrorMessage(msg.message);
                        break;
                    }
                    default: {
                        console.warn('Unknown WS message', msg);
                    }
                }
            },
            onError: () => {
                setErrorMessage('WebSocket error occurred.');
            },
            onClose: () => {
                setConnectionStatus('idle');
                setPeers([]);
                closeConnection();
            },
        });

    // WebRTC peer connection (1:1) 
    const {
        remoteStream,
        remotePeerId,
        startCall,
        handleRemoteSignal,
        closeConnection,
        isScreenSharing,
        screenPreviewStream,
        startScreenShare,
        stopScreenShare,
    } = usePeerConnection({
        localStream,
        sendSignal: (payload, targetPeerId) => {
            if (!peerId) return;
            sendJson({
                type: 'signal',
                roomId: recordingId,
                peerId,
                targetPeerId,
                payload,
            });
        },
    });

    useEffect(() => {
        const videoEl = remoteVideoRef.current;
        if (!videoEl) return;

        if (remoteStream) {
            videoEl.srcObject = remoteStream;
        } else {
            videoEl.srcObject = null;
        }
    }, [remoteStream]);

    useEffect(() => {
        const el = screenPreviewRef.current;
        if (!el) return;

        if (screenPreviewStream) {
            el.srcObject = screenPreviewStream;
        } else {
            el.srcObject = null;
        }
    }, [screenPreviewStream]);

    const isConnected = connectionStatus === 'connected';
    const canShareScreen = isConnected && !!localStream && !!remotePeerId;

    const [pendingCallPeerId, setPendingCallPeerId] = useState<string | null>(null);

    useEffect(() => {
        if (role !== 'host') return;
        if (!pendingCallPeerId) return;
        if (!localStream) return;          // critical: wait for camera/mic stream
        if (!peerId) return;
        if (remotePeerId) return;          // already connected

        console.log('[studio] starting call (gated) to', pendingCallPeerId);
        startCall(pendingCallPeerId);
        setPendingCallPeerId(null);
    }, [role, pendingCallPeerId, localStream, peerId, remotePeerId, startCall]);

    async function handleJoinRoom() {
        if (!peerId) return;
        setErrorMessage(null);

        // start camera + mic first
        await startLocalMedia();

        connect();
    }

    function handleLeaveRoom() {
        if (peerId) {
            sendJson({
                type: 'leave',
                roomId: recordingId,
                peerId,
            });
        }
        disconnect();
        stopLocalMedia();
        closeConnection();
        setConnectionStatus('idle');
        setPeers([]);
    }

    useEffect(() => {
        return () => {
            // Stop camera/mic when leaving the page
            localStream?.getTracks().forEach((t) => t.stop());
        };
    }, [localStream]);

    return (
        <main className="min-h-[calc(100vh-56px)] bg-slate-950 text-slate-50">
            <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
                {/* Header */}
                <header className="space-y-2">
                    <h1 className="text-2xl font-semibold">Studio</h1>
                    <p className="text-sm text-slate-400 max-w-2xl">
                        Minimal WebRTC studio tied to this recording. Join as host or guest,
                        see your own preview, and when another peer joins you&apos;ll see a
                        live 1:1 video feed.
                    </p>
                </header>

                {/* Room / recording info + controls */}
                <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3">
                    <div className="space-y-1">
                        <p className="text-xs text-slate-400 uppercase tracking-wide">
                            Recording studio
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-100 font-mono text-xs">
                                recordingId: {recordingId}
                            </span>
                            <span className="text-slate-400">·</span>
                            <span className="text-xs text-slate-300">
                                You are{' '}
                                <span className="font-medium text-sky-300">
                                    {role === 'host' ? 'Host' : 'Guest'}
                                </span>
                            </span>
                            <span className="text-slate-400">·</span>
                            <span className="text-xs text-slate-300">
                                Status:{' '}
                                <span className="font-medium">
                                    {connectionStatus === 'idle' && (
                                        <span className="text-slate-300">Not connected</span>
                                    )}
                                    {connectionStatus === 'connecting' && (
                                        <span className="text-amber-300">Connecting…</span>
                                    )}
                                    {connectionStatus === 'connected' && (
                                        <span className="text-emerald-300">Live</span>
                                    )}
                                </span>
                            </span>
                        </div>
                        {peerId && (
                            <p className="text-[11px] text-slate-500">
                                Your peer ID for this tab: {peerId}
                            </p>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        <select
                            value={role}
                            onChange={(e) => setRole(e.target.value as Role)}
                            className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-50 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            disabled={isConnected}
                        >
                            <option value="host">Host</option>
                            <option value="guest">Guest</option>
                        </select>

                        {!isConnected ? (
                            <button
                                type="button"
                                className="rounded-md bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-600 disabled:opacity-60"
                                onClick={handleJoinRoom}
                                disabled={!peerId || mediaStatus === 'starting'}
                            >
                                {mediaStatus === 'starting' ? 'Starting media…' : 'Join room'}
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="rounded-md border border-red-500/70 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/10"
                                onClick={handleLeaveRoom}
                            >
                                Leave room
                            </button>
                        )}
                    </div>
                </section>

                {errorMessage && (
                    <p className="px-4 text-xs text-red-400">{errorMessage}</p>
                )}

                {/* Main studio layout: Local + Remote */}
                <section className="grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                    {/* Local side */}
                    <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                        <div className="flex items-center justify-between mb-1">
                            <h2 className="text-xs font-medium uppercase tracking-wide text-slate-400">
                                You
                            </h2>
                            <span className="text-[11px] text-slate-500">
                                Uses your Tech Check devices (once wired).
                            </span>
                        </div>

                        <section>
                            <h2 className="text-lg font-semibold mb-2">YOU</h2>

                            {/* Camera preview */}
                            <div className="relative aspect-video w-full rounded-xl bg-slate-950 border border-slate-800 overflow-hidden">
                                <video
                                    ref={localVideoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className={`h-full w-full object-cover transition-opacity ${localStream ? 'opacity-100' : 'opacity-30'
                                        }`}
                                />
                                {!localStream && (
                                    <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500 text-center px-4">
                                        Click <span className="mx-1 font-semibold">Join room</span> to
                                        start your camera and microphone preview.
                                    </div>
                                )}
                            </div>

                            {/* Screen preview while sharing */}
                            {isScreenSharing && (
                                <div className="mt-4">
                                    <p className="text-sm text-slate-400 mb-1">
                                        You’re sharing this screen
                                    </p>
                                    <div className="relative aspect-video w-full rounded-lg bg-black border border-dashed border-slate-600 overflow-hidden">
                                        <video
                                            ref={screenPreviewRef}
                                            autoPlay
                                            muted
                                            playsInline
                                            className="h-full w-full object-cover"
                                        />
                                    </div>
                                </div>
                            )}
                        </section>

                        {mediaError && (
                            <p className="text-xs text-red-400">{mediaError}</p>
                        )}

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                                type="button"
                                onClick={toggleMic}
                                disabled={!localStream}
                                className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs border ${isMicMuted
                                    ? 'border-slate-700 bg-slate-950 text-slate-400'
                                    : 'border-slate-600 bg-slate-800 text-slate-50'
                                    } disabled:opacity-50`}
                            >
                                <span>{isMicMuted ? '🔇 Mic off' : '🎙️ Mic on'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={toggleCamera}
                                disabled={!localStream}
                                className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs border ${isCameraOff
                                    ? 'border-slate-700 bg-slate-950 text-slate-400'
                                    : 'border-slate-600 bg-slate-800 text-slate-50'
                                    } disabled:opacity-50`}
                            >
                                <span>{isCameraOff ? '🚫 Camera off' : '📷 Camera on'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={isScreenSharing ? stopScreenShare : startScreenShare}
                                disabled={!canShareScreen}
                                className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs border ${isScreenSharing
                                    ? 'border-amber-400 bg-amber-500/10 text-amber-200'
                                    : 'border-slate-700 bg-slate-950 text-slate-400'
                                    } disabled:opacity-50`}
                            >
                                {isScreenSharing ? '🛑 Stop sharing' : '🖥️ Screen share'}
                            </button>

                            <span className="text-[11px] text-slate-500">
                                Screen share changes what remote participants see; your local
                                preview above still shows your camera.
                            </span>
                        </div>
                    </div>

                    {/* Remote / guests side */}
                    <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                        <div className="flex items-center justify-between mb-1">
                            <h2 className="text-xs font-medium uppercase tracking-wide text-slate-400">
                                Guests / Remote
                            </h2>
                            <span className="text-[11px] text-slate-500">
                                Open this studio URL in another tab to see remote video.
                            </span>
                        </div>

                        <div className="relative h-40 rounded-xl border border-dashed border-slate-700 bg-slate-950 flex items-center justify-center overflow-hidden">
                            <video
                                ref={remoteVideoRef}
                                autoPlay
                                playsInline
                                muted
                                className={`h-full w-full object-cover transition-opacity ${remoteStream ? 'opacity-100' : 'opacity-30'
                                    }`}
                            />
                            {!remoteStream && (
                                <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500 text-center px-4">
                                    When another peer joins and WebRTC connects, their video will
                                    appear here.
                                </div>
                            )}
                        </div>

                        <div className="h-24 rounded-xl border border-dashed border-slate-700 bg-slate-950 p-2 text-[11px] text-slate-400">
                            <p className="mb-1 font-medium text-slate-300">Peers in room</p>
                            {peers.length === 0 ? (
                                <p className="text-slate-500">
                                    No other peers connected yet. Join from another tab or device.
                                </p>
                            ) : (
                                <ul className="space-y-1">
                                    {peers.map((p) => (
                                        <li
                                            key={p.peerId}
                                            className="flex items-center justify-between rounded bg-slate-900 px-2 py-1"
                                        >
                                            <span className="font-mono text-[10px] text-slate-300">
                                                {p.peerId}
                                            </span>
                                            <span className="text-[10px] text-slate-400">
                                                {p.role === 'host' ? 'Host' : 'Guest'}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
}
