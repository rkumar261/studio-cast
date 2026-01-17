'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type TechCheckPrefs = {
    audioInputId?: string;
    videoInputId?: string;
};

/**
 * IMPORTANT:
 * Your Tech Check page uses: const PREFS_KEY = 'techCheckPrefs';
 * So Studio MUST read the same key, otherwise device preferences won't apply.
 */
const TECH_CHECK_PREFS_KEY = 'techCheckPrefs';

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
    const streamRef = useRef<MediaStream | null>(null);

    const [stream, setStream] = useState<MediaStream | null>(null);
    const [status, setStatus] = useState<LocalMediaStatus>('idle');
    const [error, setError] = useState<string | null>(null);

    const [isMicMuted, setIsMicMuted] = useState(false);
    const [isCameraOff, setIsCameraOff] = useState(false);

    // Keep ref in sync with state for reliable cleanup.
    useEffect(() => {
        streamRef.current = stream;
    }, [stream]);

    const stop = useCallback(() => {
        const s = streamRef.current;
        if (s) {
            s.getTracks().forEach((t) => t.stop());
        }
        streamRef.current = null;

        setStream(null);
        setStatus('idle');
        setIsMicMuted(false);
        setIsCameraOff(false);
        setError(null);
    }, []);

    /** Start camera + mic using Tech Check device prefs if available. */
    const start = useCallback(async () => {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            setError('Media devices are not available in this environment.');
            setStatus('error');
            return;
        }

        // If we already have a stream, don't start again.
        if (streamRef.current) return;

        setStatus('starting');
        setError(null);

        const prefs = loadTechCheckPrefs();

        const audioConstraints: MediaTrackConstraints | true = prefs.audioInputId
            ? { deviceId: { exact: prefs.audioInputId } }
            : true;

        const videoConstraints: MediaTrackConstraints | true = prefs.videoInputId
            ? {
                deviceId: { exact: prefs.videoInputId },
                width: { ideal: 1280 },
                height: { ideal: 720 },
            }
            : {
                width: { ideal: 1280 },
                height: { ideal: 720 },
            };

        // Helper to attempt getUserMedia with constraints.
        const tryGet = async (constraints: MediaStreamConstraints) =>
            navigator.mediaDevices.getUserMedia(constraints);

        try {
            // 1) Best case: audio + video
            const mediaStream = await tryGet({ audio: audioConstraints, video: videoConstraints });

            streamRef.current = mediaStream;
            setStream(mediaStream);
            setStatus('live');
            setIsMicMuted(false);
            setIsCameraOff(false);
            setError(null);
            return;
        } catch (errBoth: any) {
            // 2) Fallback: video-only
            try {
                const mediaStream = await tryGet({ audio: false, video: videoConstraints });

                streamRef.current = mediaStream;
                setStream(mediaStream);
                setStatus('live');
                setIsMicMuted(true); // no audio track
                setIsCameraOff(false);
                setError('Microphone not available. Joined with camera only.');
                return;
            } catch {
                // 3) Fallback: audio-only
                try {
                    const mediaStream = await tryGet({ audio: audioConstraints, video: false });

                    streamRef.current = mediaStream;
                    setStream(mediaStream);
                    setStatus('live');
                    setIsMicMuted(false);
                    setIsCameraOff(true); // no video track
                    setError('Camera not available. Joined with microphone only.');
                    return;
                } catch (errFinal: any) {
                    console.error('[studio] getUserMedia failed', errFinal);
                    setError(errFinal?.message ?? errBoth?.message ?? 'Unable to access camera or microphone.');
                    setStatus('error');
                }
            }
        }
    }, []);

    const toggleMic = useCallback(() => {
        const s = streamRef.current;
        if (!s) return;

        const audioTracks = s.getAudioTracks();
        if (!audioTracks.length) return;

        const nextEnabled = !audioTracks[0].enabled;
        audioTracks.forEach((t) => (t.enabled = nextEnabled));
        setIsMicMuted(!nextEnabled);
    }, []);

    const toggleCamera = useCallback(() => {
        const s = streamRef.current;
        if (!s) return;

        const videoTracks = s.getVideoTracks();
        if (!videoTracks.length) return;

        const nextEnabled = !videoTracks[0].enabled;
        videoTracks.forEach((t) => (t.enabled = nextEnabled));
        setIsCameraOff(!nextEnabled);
    }, []);

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
