import { TextDecoder, TextEncoder } from 'util';
import type { RemoteParticipant, Track as LivekitTrack } from 'livekit-client';

Object.assign(globalThis, {
  TextDecoder,
  TextEncoder,
});

let Track: typeof import('livekit-client').Track;
let buildLivekitPeers: typeof import('@/lib/studio/connection-view-model').buildLivekitPeers;
let buildLivekitTiles: typeof import('@/lib/studio/connection-view-model').buildLivekitTiles;

function makeParticipant(args: {
  sid: string;
  name?: string;
  identity?: string;
  tracks?: Partial<Record<(typeof Track.Source)[keyof typeof Track.Source], { track: LivekitTrack | null; isMuted?: boolean }>>;
}): RemoteParticipant {
  return {
    sid: args.sid,
    name: args.name,
    identity: args.identity,
    getTrackPublication: (source: (typeof Track.Source)[keyof typeof Track.Source]) =>
      args.tracks?.[source] ?? null,
  } as unknown as RemoteParticipant;
}

describe('connection view model helpers', () => {
  beforeAll(async () => {
    ({ Track } = await import('livekit-client'));
    ({ buildLivekitPeers, buildLivekitTiles } = await import('../../../src/lib/studio/connection-view-model'));
  });

  it('builds camera and screen tiles for a participant with both tracks', () => {
    const participant = makeParticipant({
      sid: 'remote-1',
      name: 'Guest One',
      tracks: {
        [Track.Source.Microphone]: { track: { sid: 'mic-1' } as unknown as LivekitTrack, isMuted: false },
        [Track.Source.Camera]: { track: { sid: 'cam-1' } as unknown as LivekitTrack },
        [Track.Source.ScreenShare]: { track: { sid: 'screen-1' } as unknown as LivekitTrack },
        [Track.Source.ScreenShareAudio]: {
          track: { sid: 'screen-audio-1' } as unknown as LivekitTrack,
        },
      },
    });

    const tiles = buildLivekitTiles([participant]);

    expect(tiles).toHaveLength(2);
    expect(tiles.map((tile) => tile.key)).toEqual(['remote-1-screen', 'remote-1-camera']);
    expect(tiles[0]).toMatchObject({
      label: 'Guest One',
      badge: 'Screen',
      micOff: false,
    });
    expect(tiles[0].audio?.kind).toBe('livekit');
    expect(tiles[1]).toMatchObject({
      label: 'Guest One',
      badge: 'Camera',
      micOff: false,
    });
  });

  it('builds an audio-only tile and peer fallback label when video tracks are missing', () => {
    const participant = makeParticipant({
      sid: 'remote-2',
      identity: 'guest-identity',
      tracks: {
        [Track.Source.Microphone]: {
          track: { sid: 'mic-2' } as unknown as LivekitTrack,
          isMuted: true,
        },
      },
    });

    const tiles = buildLivekitTiles([participant]);
    const peers = buildLivekitPeers([participant]);

    expect(tiles).toEqual([
      expect.objectContaining({
        key: 'remote-2-audio',
        label: 'guest-identity',
        badge: 'Audio only',
        micOff: true,
      }),
    ]);
    expect(peers).toEqual([{ id: 'remote-2', label: 'guest-identity' }]);
  });
});
