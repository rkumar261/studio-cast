'use client';

import type { MouseEvent } from 'react';

import { ParticipantTile } from '@/components/studio/ParticipantTile';
import type { Tile } from '@/lib/studio/media';

type MeetStageAreaProps = {
  meetMainTile: Tile;
  meetStageFit: 'contain' | 'cover';
  pinnedTileKey: string | null;
  meetVisibleSecondaryTiles: Tile[];
  meetLocalTileKey: string;
  meetSelfPreviewExpanded: boolean;
  onOpenMainContextMenu: (event: MouseEvent<HTMLDivElement>) => void;
  onOpenSecondaryContextMenu: (event: MouseEvent<HTMLDivElement>, tileKey: string) => void;
};

export function MeetStageArea(props: MeetStageAreaProps) {
  return (
    <div className="relative h-full min-h-0 overflow-hidden rounded-[22px] border border-slate-800 bg-black">
      <div className="h-full w-full" onContextMenu={props.onOpenMainContextMenu}>
        <ParticipantTile
          tile={props.meetMainTile}
          className="h-full w-full rounded-none border-transparent bg-black"
          fit={props.meetStageFit}
          fill
          showBadge={props.meetMainTile.badge === 'Screen'}
        />
      </div>

      {props.pinnedTileKey && (
        <div className="absolute left-4 top-4 z-20 rounded-full border border-cyan-300/40 bg-cyan-500/20 px-3 py-1 text-[11px] text-cyan-100">
          Pinned
        </div>
      )}

      {props.meetVisibleSecondaryTiles.length > 0 && (
        <div className="absolute bottom-4 right-4 z-20 flex max-w-[60%] gap-2 overflow-x-auto pb-1">
          {props.meetVisibleSecondaryTiles.slice(0, 5).map((tile) => (
            <div
              key={tile.key}
              className={`shrink-0 ${
                props.meetSelfPreviewExpanded && tile.key === props.meetLocalTileKey
                  ? 'w-[34vw] min-w-[280px] max-w-[540px]'
                  : 'w-56 md:w-64'
              }`}
              onContextMenu={(event) => props.onOpenSecondaryContextMenu(event, tile.key)}
            >
              <ParticipantTile
                tile={tile}
                className="w-full rounded-xl border-slate-600 bg-black"
                fit="cover"
                showBadge={tile.badge === 'Screen'}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
