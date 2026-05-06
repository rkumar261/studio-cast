import { mapMediaDevices } from '@/lib/studio/useStudioDevices';

function makeDevice(kind: MediaDeviceKind, deviceId: string, label = ''): MediaDeviceInfo {
  return {
    kind,
    deviceId,
    label,
    groupId: '',
    toJSON: () => ({}),
  } as MediaDeviceInfo;
}

describe('mapMediaDevices', () => {
  it('groups and labels camera, microphone, and speaker devices', () => {
    const result = mapMediaDevices([
      makeDevice('videoinput', 'cam-1', 'Built-in Camera'),
      makeDevice('audioinput', 'mic-1'),
      makeDevice('audiooutput', 'spk-1'),
      makeDevice('videoinput', 'cam-2'),
    ]);

    expect(result.cameras).toEqual([
      { id: 'cam-1', label: 'Built-in Camera' },
      { id: 'cam-2', label: 'Camera 2' },
    ]);
    expect(result.microphones).toEqual([{ id: 'mic-1', label: 'Microphone 1' }]);
    expect(result.speakers).toEqual([{ id: 'spk-1', label: 'Speaker 1' }]);
  });
});
