import {
  buildMeetViewModel,
  buildStudioCanvasLayout,
} from '@/lib/studio/stage-view-model';
import type { MediaSource, Tile } from '@/lib/studio/media';
import type { Track } from 'livekit-client';

function media(stream: MediaStream | null): MediaSource {
  return { kind: 'media', stream };
}

function livekit(track: Track | null): MediaSource {
  return { kind: 'livekit', track };
}

describe('stage view model helpers', () => {
  it('builds studio canvas layout with local camera and screen tiles', () => {
    const result = buildStudioCanvasLayout({
      displayName: 'Rakesh',
      studioLayoutMode: 'screen_share_dominant',
      active: {
        isMicEnabled: true,
        localVideo: livekit({ id: 'camera-track' } as unknown as Track),
        localScreen: livekit({ id: 'screen-track' } as unknown as Track),
        tiles: [
          {
            key: 'guest-camera',
            label: 'Guest',
            badge: 'Camera',
            video: media(null),
          },
        ],
        peers: [],
      },
    });

    expect(result.visibleTiles.map((tile) => tile.key)).toEqual([
      'studio-local-camera',
      'studio-local-screen',
      'guest-camera',
    ]);
    expect(result.screenTiles.map((tile) => tile.key)).toEqual(['studio-local-screen']);
    expect(result.webcamTiles.map((tile) => tile.key)).toEqual([
      'studio-local-camera',
      'guest-camera',
    ]);
    expect(result.isScreenShareDominant).toBe(true);
    expect(result.stageGridClass).toBe('xl:grid-cols-3 md:grid-cols-2 auto-rows-fr');
  });

  it('builds meet view model with pinned tile and filtered self preview', () => {
    const remoteTiles: Tile[] = [
      {
        key: 'guest-screen',
        label: 'Guest One',
        badge: 'Screen',
        video: media(null),
      },
      {
        key: 'guest-camera',
        label: 'Guest One',
        badge: 'Camera',
        video: media(null),
      },
    ];

    const result = buildMeetViewModel({
      displayName: 'Rakesh',
      preJoinPreviewStream: null,
      pinnedTileKey: 'guest-camera',
      showMeetSelfPreview: false,
      active: {
        isMicEnabled: true,
        localVideo: media(null),
        localScreen: media(null),
        tiles: remoteTiles,
        peers: [{ id: 'peer-1', label: 'Guest One' }],
      },
    });

    expect(result.meetMainTile.key).toBe('guest-camera');
    expect(result.hasRemoteStage).toBe(true);
    expect(result.meetVisibleSecondaryTiles.map((tile) => tile.key)).toEqual(['guest-screen']);
    expect(result.meetPeople).toEqual([
      {
        id: 'local',
        label: 'Rakesh',
        role: 'You',
        tileKey: 'meet-local-camera',
      },
      {
        id: 'peer-1',
        label: 'Guest One',
        role: 'Guest',
        tileKey: 'guest-screen',
      },
    ]);
  });
});
