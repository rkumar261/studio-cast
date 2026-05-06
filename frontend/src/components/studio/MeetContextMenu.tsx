'use client';

import type { MeetContextMenuState } from '@/lib/studio/useMeetStageUi';

type MeetContextMenuProps = {
  menu: MeetContextMenuState;
  pinnedTileKey: string | null;
  meetLocalTileKey: string;
  hasRemoteStage: boolean;
  meetSelfPreviewExpanded: boolean;
  onPin: (tileKey: string) => void;
  onUnpin: () => void;
  onHideSelfPreview: () => void;
  onToggleSelfPreviewSize: () => void;
  onToggleFullscreen: () => void | Promise<void>;
  onClose: () => void;
};

export function MeetContextMenu(props: MeetContextMenuProps) {
  if (!props.menu) return null;
  const menu = props.menu;

  return (
    <div
      className="fixed z-[80] min-w-52 rounded-xl border border-slate-700 bg-[#1b1e24] p-1 shadow-2xl"
      style={{ left: menu.x, top: menu.y }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {props.menu.isMain ? (
        <>
          {props.pinnedTileKey === menu.tileKey ? (
            <button
              type="button"
              onClick={() => {
                props.onUnpin();
                props.onClose();
              }}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/60"
            >
              Unpin from screen
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                props.onPin(menu.tileKey);
                props.onClose();
              }}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/60"
            >
              Pin to screen
            </button>
          )}
          {menu.tileKey === props.meetLocalTileKey && props.hasRemoteStage && (
            <button
              type="button"
              onClick={() => {
                props.onUnpin();
                props.onClose();
              }}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/60"
            >
              Show in a tile
            </button>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            props.onPin(menu.tileKey);
            props.onClose();
          }}
          className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/60"
        >
          Pin to screen
        </button>
      )}

      {menu.tileKey === props.meetLocalTileKey && !menu.isMain && (
        <>
          <button
            type="button"
            onClick={() => {
              props.onHideSelfPreview();
              props.onClose();
            }}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/60"
          >
            Minimize
          </button>
          <button
            type="button"
            onClick={() => {
              props.onToggleSelfPreviewSize();
              props.onClose();
            }}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/60"
          >
            {props.meetSelfPreviewExpanded ? 'Normal size' : 'Maximize preview'}
          </button>
        </>
      )}

      <button
        type="button"
        onClick={() => {
          void props.onToggleFullscreen();
          props.onClose();
        }}
        className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/60"
      >
        Full screen
      </button>
    </div>
  );
}
