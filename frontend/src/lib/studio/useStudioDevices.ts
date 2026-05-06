'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type DeviceOption = { id: string; label: string };
export type PreJoinStatus = 'idle' | 'starting' | 'ready' | 'error';

export function mapMediaDevices(devices: MediaDeviceInfo[]) {
  const cameras: DeviceOption[] = [];
  const microphones: DeviceOption[] = [];
  const speakers: DeviceOption[] = [];

  devices.forEach((device) => {
    if (device.kind === 'videoinput') {
      cameras.push({
        id: device.deviceId,
        label: device.label || `Camera ${cameras.length + 1}`,
      });
    } else if (device.kind === 'audioinput') {
      microphones.push({
        id: device.deviceId,
        label: device.label || `Microphone ${microphones.length + 1}`,
      });
    } else if (device.kind === 'audiooutput') {
      speakers.push({
        id: device.deviceId,
        label: device.label || `Speaker ${speakers.length + 1}`,
      });
    }
  });

  return { cameras, microphones, speakers };
}

type UseStudioDevicesOptions = {
  previewEnabled: boolean;
};

export function useStudioDevices({ previewEnabled }: UseStudioDevicesOptions) {
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);

  const [preJoinStatus, setPreJoinStatus] = useState<PreJoinStatus>('idle');
  const [preJoinError, setPreJoinError] = useState<string | null>(null);
  const [preJoinMicEnabled, setPreJoinMicEnabled] = useState(true);
  const [preJoinCamEnabled, setPreJoinCamEnabled] = useState(true);
  const [preJoinPreviewStream, setPreJoinPreviewStream] = useState<MediaStream | null>(null);

  const [cameraDevices, setCameraDevices] = useState<DeviceOption[]>([]);
  const [micDevices, setMicDevices] = useState<DeviceOption[]>([]);
  const [speakerDevices, setSpeakerDevices] = useState<DeviceOption[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [selectedMicId, setSelectedMicId] = useState('');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState('');

  const stopPreJoinPreview = useCallback(() => {
    if (previewStreamRef.current) {
      previewStreamRef.current.getTracks().forEach((track) => track.stop());
      previewStreamRef.current = null;
    }
    setPreJoinPreviewStream(null);
  }, []);

  const enumerateDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const allDevices = await navigator.mediaDevices.enumerateDevices();
    const { cameras, microphones, speakers } = mapMediaDevices(allDevices);

    setCameraDevices(cameras);
    setMicDevices(microphones);
    setSpeakerDevices(speakers);
    setSelectedCameraId((prev) => prev || cameras[0]?.id || '');
    setSelectedMicId((prev) => prev || microphones[0]?.id || '');
    setSelectedSpeakerId((prev) => prev || speakers[0]?.id || '');
  }, []);

  const startPreJoinPreview = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPreJoinStatus('error');
      setPreJoinError('Camera and microphone are not supported in this browser.');
      return;
    }

    setPreJoinError(null);
    setPreJoinStatus('starting');
    stopPreJoinPreview();

    try {
      const constraints: MediaStreamConstraints = {
        video: selectedCameraId ? { deviceId: { exact: selectedCameraId } } : true,
        audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      previewStreamRef.current = stream;
      setPreJoinPreviewStream(stream);
      setPreJoinMicEnabled(stream.getAudioTracks().some((track) => track.enabled));
      setPreJoinCamEnabled(stream.getVideoTracks().some((track) => track.enabled));
      setPreJoinStatus('ready');
      await enumerateDevices();
    } catch (err: any) {
      setPreJoinStatus('error');
      setPreJoinError(err?.message ?? 'Could not start camera/microphone preview.');
    }
  }, [enumerateDevices, selectedCameraId, selectedMicId, stopPreJoinPreview]);

  const togglePreJoinMic = useCallback(() => {
    const stream = previewStreamRef.current;
    if (!stream) return;
    const next = !preJoinMicEnabled;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
    setPreJoinMicEnabled(next);
  }, [preJoinMicEnabled]);

  const togglePreJoinCam = useCallback(() => {
    const stream = previewStreamRef.current;
    if (!stream) return;
    const next = !preJoinCamEnabled;
    stream.getVideoTracks().forEach((track) => {
      track.enabled = next;
    });
    setPreJoinCamEnabled(next);
  }, [preJoinCamEnabled]);

  useEffect(() => {
    if (!previewEnabled) {
      stopPreJoinPreview();
      return;
    }

    startPreJoinPreview();
    return () => {
      stopPreJoinPreview();
    };
  }, [previewEnabled, startPreJoinPreview, stopPreJoinPreview]);

  useEffect(() => {
    const element = previewVideoRef.current;
    if (!element) return;

    element.srcObject = preJoinPreviewStream;
    if (preJoinPreviewStream) {
      element.play?.().catch(() => {});
    }
  }, [preJoinPreviewStream]);

  return {
    previewVideoRef,
    preJoinStatus,
    preJoinError,
    preJoinMicEnabled,
    preJoinCamEnabled,
    preJoinPreviewStream,
    cameraDevices,
    micDevices,
    speakerDevices,
    selectedCameraId,
    selectedMicId,
    selectedSpeakerId,
    setSelectedCameraId,
    setSelectedMicId,
    setSelectedSpeakerId,
    startPreJoinPreview,
    stopPreJoinPreview,
    togglePreJoinMic,
    togglePreJoinCam,
  };
}
