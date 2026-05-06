'use client';

import { ParticipantTile } from '@/components/studio/ParticipantTile';
import type { Tile } from '@/lib/studio/media';

type StudioStageAreaProps = {
  isScreenShareDominant: boolean;
  screenTiles: Tile[];
  webcamTiles: Tile[];
  visibleTiles: Tile[];
  stageGridClass: string;
  centerConstrained: boolean;
  tileClassName: string;
  pinnedTileKey: string | null;
  shouldFillTiles: boolean;
  localMicEnabled: boolean;
  onToggleLocalMic: () => void;
  onTogglePin: (tileKey: string) => void;
};

export function StudioStageArea(props: StudioStageAreaProps) {
  return (
    <div className="studio-stage-surface flex min-h-0 flex-1 rounded-3xl p-2">
      {props.isScreenShareDominant ? (
        <div className="flex h-full w-full flex-col gap-2">
          <div className="min-h-0 flex-1">
            <ParticipantTile
              key={props.screenTiles[0]!.key}
              tile={props.screenTiles[0]!}
              className="h-full w-full rounded-2xl bg-black"
              showPin={false}
              isPinned={false}
              onPin={() => {}}
              fill
              showBadge={false}
            />
          </div>
          {props.webcamTiles.length > 0 && (
            <div className="flex shrink-0 gap-2 overflow-x-auto">
              {props.webcamTiles.map((tile) => {
                const isLocalStudioTile = tile.key === 'studio-local-camera';
                return (
                  <div key={tile.key} className="h-24 w-32 shrink-0">
                    <ParticipantTile
                      tile={tile}
                      className="h-full w-full rounded-xl bg-black"
                      showPin={false}
                      isPinned={false}
                      onPin={() => {}}
                      micPublishEnabled={isLocalStudioTile ? props.localMicEnabled : undefined}
                      onTogglePublishMic={isLocalStudioTile ? props.onToggleLocalMic : undefined}
                      fill
                      showBadge={false}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div
          className={`grid h-full w-full gap-3 ${props.centerConstrained ? 'mx-auto max-w-[980px]' : ''} ${props.stageGridClass}`}
        >
          {props.visibleTiles.map((tile) => {
            const isLocalStudioTile =
              tile.key === 'studio-local-camera' || tile.key === 'studio-local-screen';
            return (
              <ParticipantTile
                key={tile.key}
                tile={tile}
                className={props.tileClassName}
                showPin
                isPinned={props.pinnedTileKey === tile.key}
                onPin={() => props.onTogglePin(tile.key)}
                micPublishEnabled={isLocalStudioTile ? props.localMicEnabled : undefined}
                onTogglePublishMic={isLocalStudioTile ? props.onToggleLocalMic : undefined}
                fill={props.shouldFillTiles}
                showBadge={false}
              />
            );
          })}
          {props.visibleTiles.length === 0 && (
            <div className="flex aspect-[4/3] items-center justify-center rounded-xl border border-dashed border-slate-700 bg-black/40 text-sm text-slate-500">
              Waiting for camera feed...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
