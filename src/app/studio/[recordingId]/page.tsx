'use client';

import React, { use, useEffect, useRef, useState } from 'react';
import { useWebSocketConnection } from '@/lib/studio/useWebSocketConnection';
import { useLocalMedia } from '@/lib/studio/useLocalMedia';

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

    // --- Local media hook (real camera + mic) ---
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

    // Attach MediaStream to <video> element when stream changes
    useEffect(() => {
        const videoEl = localVideoRef.current;
        if (!videoEl) return;

        if (localStream) {
            videoEl.srcObject = localStream;
        } else {
            videoEl.srcObject = null;
        }
    }, [localStream]);

    // --- WebSocket signaling ---
    const { status: wsStatus, connect, disconnect, sendJson } =
        useWebSocketConnection('/v1/studio/signaling', {
            onOpen: () => {
                // When WS opens, send join message
                setConnectionStatus('connecting');
                setErrorMessage(null);

                if (!peerId) return; // safety; shouldn't happen because we gate join

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
                        break;
                    }
                    case 'peer-joined': {
                        setPeers((prev) => {
                            if (prev.some((p) => p.peerId === msg.peerId)) return prev;
                            return [...prev, { peerId: msg.peerId, role: msg.role }];
                        });
                        break;
                    }
                    case 'peer-left': {
                        setPeers((prev) => prev.filter((p) => p.peerId !== msg.peerId));
                        break;
                    }
                    case 'signal': {
                        // Later: handle offer/answer/ice, markers, etc.
                        console.debug('Received signal payload', msg.payload);
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
            },
        });

    const isConnected = connectionStatus === 'connected';

    async function handleJoinRoom() {
        if (!peerId) return; // wait until client has generated ID
        setErrorMessage(null);

        // Start camera + mic first (uses Tech Check prefs if present)
        await startLocalMedia();

        // Even if media fails, we still try to connect so signaling works;
        // you can change this behaviour later if you want to require media.
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
        setConnectionStatus('idle');
        setPeers([]);
    }

    return (
        <main className="min-h-[calc(100vh-56px)] bg-slate-950 text-slate-50">
            <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
                {/* Header */}
                <header className="space-y-2">
                    <h1 className="text-2xl font-semibold">Studio</h1>
                    <p className="text-sm text-slate-400 max-w-2xl">
                        Minimal WebRTC studio tied to this recording. You&apos;ll be able to join as host or
                        guest, see your local preview, and later add remote participants, markers, and screen
                        share.
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
                                In later steps this will use your Tech Check devices.
                            </span>
                        </div>

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
                                disabled
                                className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs border border-slate-700 bg-slate-950 text-slate-500 opacity-70 cursor-not-allowed"
                            >
                                🖥️ Screen share (soon)
                            </button>
                            <span className="text-[11px] text-slate-500">
                                Mic / camera buttons now control real media tracks.
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
                                Open this studio URL in another tab to see peers join and leave.
                            </span>
                        </div>

                        <div className="space-y-3">
                            <div className="h-28 rounded-xl border border-dashed border-slate-700 bg-slate-950 flex items-center justify-center text-xs text-slate-500">
                                Remote video thumbnail placeholder
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
                    </div>
                </section>
            </div>
        </main>
    );
}
