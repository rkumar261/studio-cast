'use client';

import { mediaSource, type MediaSource, type Tile } from '@/lib/studio/media';

export type StudioPeerSummary = {
  id: string;
  label: string;
};

type StudioVisualState = {
  isMicEnabled: boolean;
  localVideo: MediaSource;
  localScreen: MediaSource;
  tiles: Tile[];
  peers: StudioPeerSummary[];
};

type BuildStudioCanvasLayoutArgs = {
  displayName: string;
  active: StudioVisualState;
  studioLayoutMode: 'grid' | 'screen_share_dominant';
};

type BuildMeetViewModelArgs = {
  displayName: string;
  active: StudioVisualState;
  preJoinPreviewStream: MediaStream | null;
  pinnedTileKey: string | null;
  showMeetSelfPreview: boolean;
};

function hasMediaSourceValue(source: MediaSource) {
  return source.kind === 'livekit' ? !!source.track : !!source.stream;
}

function deriveStageGridClass(tileCount: number) {
  if (tileCount >= 4) return 'xl:grid-cols-4 md:grid-cols-2 auto-rows-fr';
  if (tileCount === 3) return 'xl:grid-cols-3 md:grid-cols-2 auto-rows-fr';
  if (tileCount === 2) return 'md:grid-cols-2 auto-rows-fr';
  return 'grid-cols-1 auto-rows-fr';
}

export function buildStudioCanvasLayout(args: BuildStudioCanvasLayoutArgs) {
  const studioCanvasTiles: Tile[] = [
    {
      key: 'studio-local-camera',
      label: args.displayName || 'You',
      badge: 'Camera',
      video: args.active.localVideo,
      muted: true,
      micOff: !args.active.isMicEnabled,
    },
  ];

  if (hasMediaSourceValue(args.active.localScreen)) {
    studioCanvasTiles.push({
      key: 'studio-local-screen',
      label: `${args.displayName || 'You'} (Screen)`,
      badge: 'Screen',
      video: args.active.localScreen,
      muted: true,
      micOff: !args.active.isMicEnabled,
    });
  }

  studioCanvasTiles.push(...args.active.tiles);

  const screenTiles = studioCanvasTiles.filter((tile) => tile.key.includes('screen'));
  const webcamTiles = studioCanvasTiles.filter((tile) => !tile.key.includes('screen'));
  const visibleTiles = studioCanvasTiles;

  return {
    studioCanvasTiles,
    screenTiles,
    webcamTiles,
    visibleTiles,
    isScreenShareDominant:
      args.studioLayoutMode === 'screen_share_dominant' && screenTiles.length > 0,
    stageGridClass: deriveStageGridClass(visibleTiles.length),
    shouldFillTiles: true,
    tileClassName: 'h-full min-h-0 rounded-2xl border-violet-400/60 bg-black',
  };
}

export function buildMeetViewModel(args: BuildMeetViewModelArgs) {
  const hasLocalPublishedVideo = hasMediaSourceValue(args.active.localVideo);
  const meetLocalTile: Tile = {
    key: 'meet-local-camera',
    label: args.displayName || 'You',
    badge: 'You',
    video: hasLocalPublishedVideo ? args.active.localVideo : mediaSource(args.preJoinPreviewStream),
    muted: true,
  };

  const hasLocalScreenTrack = hasMediaSourceValue(args.active.localScreen);
  const meetLocalScreenTile: Tile | null = hasLocalScreenTrack
    ? {
        key: 'meet-local-screen',
        label: args.displayName || 'You',
        badge: 'Screen',
        video: args.active.localScreen,
        muted: true,
      }
    : null;

  const meetAllTiles = [
    meetLocalTile,
    ...(meetLocalScreenTile ? [meetLocalScreenTile] : []),
    ...args.active.tiles,
  ];

  const defaultMeetMainTile =
    meetAllTiles.find((tile) => tile.badge === 'Screen') ??
    args.active.tiles[0] ??
    meetLocalTile;

  const meetMainTile =
    (args.pinnedTileKey
      ? meetAllTiles.find((tile) => tile.key === args.pinnedTileKey)
      : null) ?? defaultMeetMainTile;

  const meetSecondaryTiles = meetAllTiles.filter((tile) => tile.key !== meetMainTile.key);
  const meetVisibleSecondaryTiles = meetSecondaryTiles.filter(
    (tile) => args.showMeetSelfPreview || tile.key !== meetLocalTile.key
  );

  const remotePrimaryTile = new Map<string, string>();
  args.active.tiles.forEach((tile) => {
    if (!remotePrimaryTile.has(tile.label)) {
      remotePrimaryTile.set(tile.label, tile.key);
    }
  });

  const meetPeople = [
    {
      id: 'local',
      label: args.displayName || 'You',
      role: 'You',
      tileKey: meetLocalTile.key,
    },
    ...args.active.peers.map((peer) => ({
      id: peer.id,
      label: peer.label,
      role: 'Guest',
      tileKey: remotePrimaryTile.get(peer.label) ?? null,
    })),
  ];

  return {
    meetLocalTile,
    meetLocalScreenTile,
    meetAllTiles,
    meetMainTile,
    hasRemoteStage: args.active.tiles.length > 0,
    meetVisibleSecondaryTiles,
    meetPeople,
  };
}
