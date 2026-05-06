'use client';

import {
  useCallback,
  useEffect,
  useState,
  type MouseEvent,
  type RefObject,
} from 'react';

export type MeetContextMenuState = {
  x: number;
  y: number;
  tileKey: string;
  isMain: boolean;
} | null;

type UseMeetStageUiOptions = {
  stageRef: RefObject<HTMLDivElement | null>;
};

export function useMeetStageUi({ stageRef }: UseMeetStageUiOptions) {
  const [showMeetSelfPreview, setShowMeetSelfPreview] = useState(true);
  const [meetSelfPreviewExpanded, setMeetSelfPreviewExpanded] = useState(false);
  const [meetStageFit, setMeetStageFit] = useState<'contain' | 'cover'>('contain');
  const [showMeetPeoplePanel, setShowMeetPeoplePanel] = useState(true);
  const [showMeetViewMenu, setShowMeetViewMenu] = useState(false);
  const [meetContextMenu, setMeetContextMenu] = useState<MeetContextMenuState>(null);

  const openMeetContextMenu = useCallback(
    (event: MouseEvent<HTMLElement>, tileKey: string, isMain: boolean) => {
      event.preventDefault();
      setMeetContextMenu({
        x: event.clientX,
        y: event.clientY,
        tileKey,
        isMain,
      });
    },
    []
  );

  const closeMeetContextMenu = useCallback(() => {
    setMeetContextMenu(null);
  }, []);

  const toggleMeetFullscreen = useCallback(async () => {
    const stageElement = stageRef.current;
    if (!stageElement) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await stageElement.requestFullscreen();
      }
    } catch {
      // Ignore fullscreen errors; this is only a UI convenience action.
    }
  }, [stageRef]);

  useEffect(() => {
    if (!meetContextMenu) return;

    const onPointerDown = () => setMeetContextMenu(null);
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMeetContextMenu(null);
      }
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onEsc);
    };
  }, [meetContextMenu]);

  useEffect(() => {
    if (!showMeetViewMenu) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-meet-view-menu-root]')) return;
      setShowMeetViewMenu(false);
    };

    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [showMeetViewMenu]);

  return {
    showMeetSelfPreview,
    setShowMeetSelfPreview,
    meetSelfPreviewExpanded,
    setMeetSelfPreviewExpanded,
    meetStageFit,
    setMeetStageFit,
    showMeetPeoplePanel,
    setShowMeetPeoplePanel,
    showMeetViewMenu,
    setShowMeetViewMenu,
    meetContextMenu,
    openMeetContextMenu,
    closeMeetContextMenu,
    toggleMeetFullscreen,
  };
}
