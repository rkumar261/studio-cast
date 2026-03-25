'use client';

import { useCallback, useRef, useState } from 'react';

export type StreamQualityResult = {
  videoOk: boolean;
  audioOk: boolean;
  /** 'black_stream' | null */
  videoWarning: string | null;
  /** 'silent_stream' | 'no_audio_track' | null */
  audioWarning: string | null;
};

/**
 * One-shot quality probe for a MediaStream.
 * Shared by P3 (same-machine camera/mic conflict) and U2 (getUserMedia failure).
 *
 * Video check: captures a single frame via OffscreenCanvas, computes average
 * pixel luminance. If below 8/255 (~3% brightness) → 'black_stream'.
 *
 * Audio check: attaches a Web Audio AnalyserNode, samples RMS energy for 500ms.
 * If below -60dBFS → 'silent_stream'.
 *
 * Also checks track.readyState — if 'ended', flags immediately.
 *
 * Returns a probe function and the latest result.
 */
export function useStreamQualityProbe() {
  const [result, setResult] = useState<StreamQualityResult | null>(null);
  const probeRunningRef = useRef(false);

  const probe = useCallback(async (stream: MediaStream | null): Promise<StreamQualityResult> => {
    if (probeRunningRef.current) {
      return result ?? { videoOk: true, audioOk: true, videoWarning: null, audioWarning: null };
    }
    probeRunningRef.current = true;

    try {
      const out: StreamQualityResult = {
        videoOk: true,
        audioOk: true,
        videoWarning: null,
        audioWarning: null,
      };

      if (!stream) {
        out.videoOk = false;
        out.audioOk = false;
        out.videoWarning = 'black_stream';
        out.audioWarning = 'no_audio_track';
        setResult(out);
        return out;
      }

      // ── Video check ──────────────────────────────────────────────────────────
      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length === 0) {
        out.videoOk = false;
        out.videoWarning = 'black_stream';
      } else {
        const vTrack = videoTracks[0]!;
        if (vTrack.readyState === 'ended') {
          out.videoOk = false;
          out.videoWarning = 'black_stream';
        } else {
          try {
            const avgLuminance = await sampleFrameLuminance(stream);
            if (avgLuminance < 8) {
              out.videoOk = false;
              out.videoWarning = 'black_stream';
            }
          } catch {
            // If frame capture fails, don't penalise — canvas/OffscreenCanvas may not be available
          }
        }
      }

      // ── Audio check ──────────────────────────────────────────────────────────
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        out.audioOk = false;
        out.audioWarning = 'no_audio_track';
      } else {
        const aTrack = audioTracks[0]!;
        if (aTrack.readyState === 'ended') {
          out.audioOk = false;
          out.audioWarning = 'silent_stream';
        } else {
          try {
            const rmsDb = await sampleAudioRms(stream, 500);
            if (rmsDb < -60) {
              out.audioOk = false;
              out.audioWarning = 'silent_stream';
            }
          } catch {
            // AudioContext may be unavailable (e.g. in test env) — skip
          }
        }
      }

      setResult(out);
      return out;
    } finally {
      probeRunningRef.current = false;
    }
  }, [result]);

  return { probe, result };
}

// ── Internals ─────────────────────────────────────────────────────────────────

/**
 * Capture one video frame and return average pixel luminance [0–255].
 * Uses OffscreenCanvas if available, otherwise falls back to a hidden canvas.
 */
async function sampleFrameLuminance(stream: MediaStream): Promise<number> {
  const videoEl = document.createElement('video');
  videoEl.srcObject = stream;
  videoEl.muted = true;
  videoEl.playsInline = true;

  await new Promise<void>((resolve, reject) => {
    videoEl.onloadedmetadata = () => resolve();
    videoEl.onerror = () => reject(new Error('video_load_error'));
    void videoEl.play().catch(reject);
  });

  // Give the video a moment to render a frame
  await new Promise<void>((resolve) => setTimeout(resolve, 100));

  const w = videoEl.videoWidth || 320;
  const h = videoEl.videoHeight || 240;

  let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  if (typeof OffscreenCanvas !== 'undefined') {
    const oc = new OffscreenCanvas(w, h);
    ctx = oc.getContext('2d') as OffscreenCanvasRenderingContext2D;
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    ctx = canvas.getContext('2d')!;
  }

  ctx.drawImage(videoEl, 0, 0, w, h);
  videoEl.pause();
  videoEl.srcObject = null;

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  let sum = 0;
  // Sample every 8th pixel for speed
  for (let i = 0; i < data.length; i += 4 * 8) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    // Rec.601 luminance
    sum += 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return sum / (data.length / (4 * 8));
}

/**
 * Sample audio RMS energy for `durationMs` milliseconds.
 * Returns energy in dBFS (negative; 0 = full scale).
 */
async function sampleAudioRms(stream: MediaStream, durationMs: number): Promise<number> {
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);

  await new Promise<void>((resolve) => setTimeout(resolve, durationMs));

  const buf = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatTimeDomainData(buf);

  source.disconnect();
  await ctx.close();

  let sumSq = 0;
  for (const sample of buf) sumSq += sample * sample;
  const rms = Math.sqrt(sumSq / buf.length);
  // Convert to dBFS; guard against log(0)
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}
