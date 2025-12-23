'use client';

import React, { useEffect, useRef, useState } from 'react';

type SimpleDevice = {
  deviceId: string;
  label: string;
};

type PermissionStatus = 'idle' | 'pending' | 'granted' | 'denied' | 'error';
type RecordingStatus = 'idle' | 'recording' | 'finished';

type TechCheckPrefs = {
  audioInputId?: string;
  videoInputId?: string;
};

const PREFS_KEY = 'techCheckPrefs';

export default function TechCheckPage() {
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [audioInputs, setAudioInputs] = useState<SimpleDevice[]>([]);
  const [videoInputs, setVideoInputs] = useState<SimpleDevice[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<string | ''>('');
  const [selectedVideoId, setSelectedVideoId] = useState<string | ''>('');

  const [stream, setStream] = useState<MediaStream | null>(null);

  // Keep latest stream & recordedUrl in refs for cleanup on unmount
  const streamRef = useRef<MediaStream | null>(null);
  const recordedUrlRef = useRef<string | null>(null);

  // For video preview
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // For mic level meter
  const [audioLevel, setAudioLevel] = useState<number | null>(null); // 0..1
  const audioAnimationRef = useRef<number | null>(null);

  // For 5s test recording
  const [recordingStatus, setRecordingStatus] =
    useState<RecordingStatus>('idle');
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimeoutRef = useRef<number | null>(null);

  // Load preferences from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(PREFS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as TechCheckPrefs;
      if (parsed.audioInputId) setSelectedAudioId(parsed.audioInputId);
      if (parsed.videoInputId) setSelectedVideoId(parsed.videoInputId);
    } catch (err) {
      // Not critical – just log in dev and continue
      console.warn('Failed to read techCheckPrefs from localStorage', err);
    }
  }, []);

  // Save preferences whenever selection changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const prefs: TechCheckPrefs = {};
    if (selectedAudioId) prefs.audioInputId = selectedAudioId;
    if (selectedVideoId) prefs.videoInputId = selectedVideoId;
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch (err) {
      // Storage might be unavailable; not fatal
      console.warn('Failed to save techCheckPrefs to localStorage', err);
    }
  }, [selectedAudioId, selectedVideoId]);

  // Global cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioAnimationRef.current != null) {
        cancelAnimationFrame(audioAnimationRef.current);
      }
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      if (recordingTimeoutRef.current != null) {
        clearTimeout(recordingTimeoutRef.current);
      }
      if (recordedUrlRef.current) {
        URL.revokeObjectURL(recordedUrlRef.current);
      }
    };
  }, []);

  async function startTechCheck() {
    if (permissionStatus === 'pending') return;

    setPermissionStatus('pending');
    setErrorMessage(null);

    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
        throw new Error('Media devices are not available in this browser.');
      }

      // Stop any existing stream first
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      // Request combined audio + video permission
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });

      streamRef.current = newStream;
      setStream(newStream);

      // Enumerate devices after permission is granted to get proper labels
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const audios: SimpleDevice[] = [];
      const videos: SimpleDevice[] = [];

      allDevices.forEach((d) => {
        if (d.kind === 'audioinput') {
          audios.push({
            deviceId: d.deviceId,
            label: d.label || `Microphone ${audios.length + 1}`,
          });
        } else if (d.kind === 'videoinput') {
          videos.push({
            deviceId: d.deviceId,
            label: d.label || `Camera ${videos.length + 1}`,
          });
        }
      });

      setAudioInputs(audios);
      setVideoInputs(videos);

      // Choose effective selection, respecting saved prefs if they exist
      let effectiveAudioId = selectedAudioId;
      if (!effectiveAudioId || !audios.some((d) => d.deviceId === effectiveAudioId)) {
        effectiveAudioId = audios[0]?.deviceId ?? '';
      }
      let effectiveVideoId = selectedVideoId;
      if (!effectiveVideoId || !videos.some((d) => d.deviceId === effectiveVideoId)) {
        effectiveVideoId = videos[0]?.deviceId ?? '';
      }

      setSelectedAudioId(effectiveAudioId);
      setSelectedVideoId(effectiveVideoId);

      setPermissionStatus('granted');
    } catch (err: any) {
      console.error('Tech check error', err);
      if (err && err.name === 'NotAllowedError') {
        setPermissionStatus('denied');
        setErrorMessage(
          'Permission denied. Please allow access to your microphone and camera.'
        );
      } else {
        setPermissionStatus('error');
        setErrorMessage(err?.message || 'Failed to access media devices.');
      }
    }
  }

  function stopPreview() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStream(null);
    setAudioLevel(null);

    // Stop any active recording as well
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop();
    }
    if (recordingTimeoutRef.current != null) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    setRecordingStatus('idle');
  }

  const hasDevices = audioInputs.length > 0 || videoInputs.length > 0;

  // Attach stream to video element when it changes
  useEffect(() => {
    if (!videoRef.current) return;

    if (stream) {
      videoRef.current.srcObject = stream;
      videoRef.current
        .play()
        .catch((err) => console.warn('Video play error', err));
    } else {
      videoRef.current.srcObject = null;
    }
  }, [stream]);

  // Build simple mic level meter using Web Audio API
  useEffect(() => {
    if (!stream) {
      setAudioLevel(null);
      if (audioAnimationRef.current != null) {
        cancelAnimationFrame(audioAnimationRef.current);
      }
      return;
    }

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.fftSize);

    const tick = () => {
      analyser.getByteTimeDomainData(dataArray);
      // Quick-and-dirty RMS
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const val = (dataArray[i] - 128) / 128; // center to [-1,1]
        sum += val * val;
      }
      const rms = Math.sqrt(sum / dataArray.length); // 0..~1
      const clamped = Math.min(1, rms * 3); // boost a bit
      setAudioLevel(clamped);
      audioAnimationRef.current = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      if (audioAnimationRef.current != null) {
        cancelAnimationFrame(audioAnimationRef.current);
      }
      source.disconnect();
      analyser.disconnect();
      audioContext.close().catch(() => {});
    };
  }, [stream]);

  async function startTestRecording() {
    setRecordingError(null);

    if (!stream) {
      setRecordingError('Start the preview first, then record a test clip.');
      return;
    }

    if (recordingStatus === 'recording') return;

    if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
      setRecordingError('MediaRecorder is not supported in this browser.');
      return;
    }

    try {
      // Use only the audio tracks for the test recording
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        setRecordingError('No audio track available for recording.');
        return;
      }

      const audioStream = new MediaStream(audioTracks);
      const recorder = new MediaRecorder(audioStream);

      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunks.push(ev.data);
        }
      };

      recorder.onerror = (ev) => {
        console.error('Recorder error', ev);
        setRecordingError('Failed to record test clip.');
        setRecordingStatus('idle');
      };

      recorder.onstop = () => {
        try {
          const blob = new Blob(chunks, { type: 'audio/webm' });
          if (recordedUrlRef.current) {
            URL.revokeObjectURL(recordedUrlRef.current);
          }
          const url = URL.createObjectURL(blob);
          recordedUrlRef.current = url;
          setRecordedUrl(url);
          setRecordingStatus('finished');
        } catch (e) {
          console.error('Error building recorded blob', e);
          setRecordingError('Could not finalize test clip.');
          setRecordingStatus('idle');
        } finally {
          recorderRef.current = null;
        }
      };

      recorderRef.current = recorder;
      setRecordingStatus('recording');
      recorder.start();

      // Auto-stop after 5 seconds
      const timeoutId = window.setTimeout(() => {
        if (recorderRef.current && recorderRef.current.state === 'recording') {
          recorderRef.current.stop();
        }
        recordingTimeoutRef.current = null;
      }, 5000);

      recordingTimeoutRef.current = timeoutId;
    } catch (err: any) {
      console.error('startTestRecording error', err);
      setRecordingError('Could not start test recording.');
      setRecordingStatus('idle');
    }
  }

  return (
    <main className="max-w-4xl mx-auto py-8 space-y-6 text-slate-100">
      {/* Header */}
      <header className="space-y-2 px-4">
        <h1 className="text-2xl font-semibold">Tech check</h1>
        <p className="text-sm text-slate-400 max-w-2xl">
          Verify your microphone and camera before joining a studio. We&apos;ll ask the
          browser for permission, list available devices, and give you a live preview
          plus a short test clip.
        </p>
      </header>

      {/* Status + action */}
      <section className="px-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={startTechCheck}
            className="inline-flex items-center justify-center rounded-md bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={permissionStatus === 'pending'}
          >
            {permissionStatus === 'idle' && 'Start tech check'}
            {permissionStatus === 'pending' && 'Requesting permission...'}
            {permissionStatus === 'granted' && 'Re-run tech check'}
            {permissionStatus === 'denied' && 'Try again'}
            {permissionStatus === 'error' && 'Retry tech check'}
          </button>

          {stream && (
            <button
              onClick={stopPreview}
              className="inline-flex items-center justify-center rounded-md border border-slate-600 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-900/70"
            >
              Stop preview
            </button>
          )}

          <span className="text-xs text-slate-400">
            Status:{' '}
            <span className="font-medium text-slate-200">
              {permissionStatus === 'idle' && 'Not started'}
              {permissionStatus === 'pending' && 'Waiting for browser permission'}
              {permissionStatus === 'granted' &&
                (stream ? 'Ready' : 'Ready (preview stopped)')}
              {permissionStatus === 'denied' && 'Permission denied'}
              {permissionStatus === 'error' && 'Error'}
            </span>
          </span>
        </div>

        {errorMessage && (
          <p className="mt-2 text-xs text-red-400">{errorMessage}</p>
        )}
      </section>

      {/* Two-column layout */}
      <div className="grid gap-4 md:grid-cols-2 px-4">
        {/* Devices card */}
        <section className="space-y-4 border border-slate-800 rounded-xl p-4 bg-slate-900/60">
          <h2 className="font-medium text-xs uppercase tracking-wide text-slate-400">
            Devices
          </h2>
          <p className="text-sm text-slate-300">
            Choose which microphone and camera you want to use in the studio. We&apos;ll
            remember these choices for your next session.
          </p>

          {!hasDevices && permissionStatus === 'idle' && (
            <p className="text-xs text-slate-500">
              Click &quot;Start tech check&quot; to let the browser list your devices.
            </p>
          )}

          {!hasDevices && permissionStatus === 'granted' && (
            <p className="text-xs text-amber-400">
              No audio or video devices were found. Make sure your mic and camera are
              connected.
            </p>
          )}

          {audioInputs.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-200">
                Microphone
              </label>
              <select
                value={selectedAudioId}
                onChange={(e) => setSelectedAudioId(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {audioInputs.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {videoInputs.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-200">
                Camera
              </label>
              <select
                value={selectedVideoId}
                onChange={(e) => setSelectedVideoId(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {videoInputs.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {hasDevices && (
            <p className="text-[11px] text-slate-500">
              We&apos;ll use these selections when you join a recording room. In a future
              step, we&apos;ll also store them in local preferences.
            </p>
          )}
        </section>

        {/* Preview & test card */}
        <section className="space-y-4 border border-slate-800 rounded-xl p-4 bg-slate-900/60">
          <h2 className="font-medium text-xs uppercase tracking-wide text-slate-400">
            Preview & test
          </h2>
          <p className="text-sm text-slate-300">
            Check that your camera feed looks right and that your microphone is picking up
            sound. Speak normally and watch the level bar move, then record a short test
            clip.
          </p>

          {/* Video preview */}
          <div className="aspect-video w-full rounded-lg bg-slate-950 border border-slate-700 overflow-hidden flex items-center justify-center">
            {stream ? (
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                muted
                playsInline
              />
            ) : (
              <span className="text-xs text-slate-500">
                Start the tech check to see your camera preview here.
              </span>
            )}
          </div>

          {/* Mic level meter */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Mic level</span>
              <span>
                {audioLevel != null
                  ? `${Math.round(audioLevel * 100)}%`
                  : 'No input yet'}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-400 transition-[width] duration-75"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((audioLevel ?? 0) * 100),
                  )}%`,
                }}
              />
            </div>
            <p className="text-[11px] text-slate-500">
              Talk at your normal volume. The bar should bounce around the middle when
              everything is configured correctly.
            </p>
          </div>

          {/* Test recording controls */}
          <div className="space-y-2 pt-2 border-t border-slate-800 mt-3">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={startTestRecording}
                className="inline-flex items-center justify-center rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-900/80 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!stream || recordingStatus === 'recording'}
              >
                {recordingStatus === 'recording'
                  ? 'Recording 5s test...'
                  : 'Record 5s test clip'}
              </button>
              <span className="text-[11px] text-slate-400">
                {recordingStatus === 'idle' && 'No test clip recorded yet.'}
                {recordingStatus === 'recording' &&
                  'Recording... speak normally for a few seconds.'}
                {recordingStatus === 'finished' &&
                  'Test clip ready. Play it back below.'}
              </span>
            </div>

            {recordingError && (
              <p className="text-[11px] text-red-400">{recordingError}</p>
            )}

            {recordedUrl && (
              <div className="space-y-1">
                <p className="text-[11px] text-slate-400">Playback</p>
                <audio controls src={recordedUrl} className="w-full" />
              </div>
            )}
          </div>

          <p className="text-[11px] text-slate-500">
            This test clip stays local in your browser and is not uploaded anywhere. When
            we build the full studio, we&apos;ll use the same devices and levels.
          </p>
        </section>
      </div>
    </main>
  );
}
