'use client';

import { useCallback, useState } from 'react';

type TechCheckPrefs = {
    audioInputId?: string;
    videoInputId?: string;
};

// If your Tech Check page uses a different key, change this string:
const TECH_CHECK_PREFS_KEY = 'riverside-tech-check-prefs';

function loadTechCheckPrefs(): TechCheckPrefs {
    if (typeof window === 'undefined') return {};

    try {
        const raw = window.localStorage.getItem(TECH_CHECK_PREFS_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return {
            audioInputId: typeof parsed.audioInputId === 'string' ? parsed.audioInputId : undefined,
            videoInputId: typeof parsed.videoInputId === 'string' ? parsed.videoInputId : undefined,
        };
    } catch {
        return {};
    }
}

export type LocalMediaStatus = 'idle' | 'starting' | 'live' | 'error';

export function useLocalMedia() {
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [status, setStatus] = useState<LocalMediaStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [isMicMuted, setIsMicMuted] = useState(false);
    const [isCameraOff, setIsCameraOff] = useState(false);

    /** Start camera + mic using Tech Check device prefs if available. */
    const start = useCallback(async () => {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
            setError('Media devices are not available in this environment.');
            setStatus('error');
            return;
        }

        setStatus('starting');
        setError(null);

        const prefs = loadTechCheckPrefs();

        const constraints: MediaStreamConstraints = {
            audio: prefs.audioInputId
                ? { deviceId: { exact: prefs.audioInputId } }
                : true,
            video: prefs.videoInputId
                ? {
                    deviceId: { exact: prefs.videoInputId },
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                }
                : {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                },
        };

        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
            setStream(mediaStream);
            setStatus('live');
            setIsMicMuted(false);
            setIsCameraOff(false);
        } catch (err: any) {
            console.error('[studio] getUserMedia failed', err);
            setError(err?.message ?? 'Unable to access camera or microphone.');
            setStatus('error');
        }
    }, []);

    /** Stop and release all tracks. */
    const stop = useCallback(() => {
        if (stream) {
            stream.getTracks().forEach((t) => t.stop());
        }
        setStream(null);
        setStatus('idle');
        setIsMicMuted(false);
        setIsCameraOff(false);
        setError(null);
    }, [stream]);

    const toggleMic = useCallback(() => {
        if (!stream) return;
        const audioTracks = stream.getAudioTracks();
        if (!audioTracks.length) return;

        const nextEnabled = !audioTracks[0].enabled;
        audioTracks.forEach((t) => (t.enabled = nextEnabled));
        setIsMicMuted(!nextEnabled);
    }, [stream]);

    const toggleCamera = useCallback(() => {
        if (!stream) return;
        const videoTracks = stream.getVideoTracks();
        if (!videoTracks.length) return;

        const nextEnabled = !videoTracks[0].enabled;
        videoTracks.forEach((t) => (t.enabled = nextEnabled));
        setIsCameraOff(!nextEnabled);
    }, [stream]);

    return {
        stream,
        status,
        error,
        isMicMuted,
        isCameraOff,
        start,
        stop,
        toggleMic,
        toggleCamera,
    };
}
