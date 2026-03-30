'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RecordingsAPI, type ListRecordingsResponse } from '@/lib/api';
import { useSession } from '@/lib/useSession';
import { createRoomId } from '@/lib/studio/roomId';
import {
  buildRecordingCardViewModel,
  type RecordingCardViewModel,
} from '@/lib/recording-card-view-model';

type BusyAction = 'record' | 'edit' | 'go-live' | 'schedule' | 'upload' | null;

export type QuickActionViewModel = {
  key: Exclude<BusyAction, null>;
  label: string;
  caption: string;
};

export type AiToolCardViewModel = {
  id: string;
  title: string;
  description: string;
  imageStyle: string;
};

export type AnalyticsSummaryData = {
  totalMinutesRecorded: number;
  episodeCount: number;
  lastRecordingAt: string;
};

export type HomeViewModel = {
  isLoading: boolean;
  profileReady: boolean;
  recents: RecordingCardViewModel[];
  recentsLoading: boolean;
  recentsError: string | null;
  busyAction: BusyAction;
  actionError: string | null;
  analyticsData?: AnalyticsSummaryData;
  quickActions: QuickActionViewModel[];
  aiTools: AiToolCardViewModel[];
  onQuickAction: (key: Exclude<BusyAction, null>) => Promise<void> | void;
};

const QUICK_ACTIONS: QuickActionViewModel[] = [
  { key: 'record', label: 'Record', caption: 'Create a new studio session' },
  { key: 'edit', label: 'Edit', caption: 'Jump back into a recent project' },
  { key: 'go-live', label: 'Go live', caption: 'Launch an instant meet room' },
  { key: 'schedule', label: 'Schedule', caption: 'Plan upcoming sessions' },
  { key: 'upload', label: 'Upload', caption: 'Open the archive workspace' },
];

const AI_TOOLS: AiToolCardViewModel[] = [
  {
    id: 'translate',
    title: 'AI Translate',
    description: 'Translate, dub, and localize your finished recordings for new audiences.',
    imageStyle:
      'bg-[radial-gradient(circle_at_20%_20%,rgba(152,109,255,0.55),transparent_35%),linear-gradient(135deg,#17102a,#261547_60%,#0f1020)]',
  },
  {
    id: 'magic-audio',
    title: 'Magic Audio',
    description: 'Clean and balance remote audio into a polished studio-quality mix.',
    imageStyle:
      'bg-[linear-gradient(140deg,#101217,#181b22_30%,#0d0f13)]',
  },
  {
    id: 'clips',
    title: 'Magic Clips',
    description: 'Generate social-ready cuts from long-form recordings in a few clicks.',
    imageStyle:
      'bg-[radial-gradient(circle_at_65%_35%,rgba(255,255,255,0.16),transparent_25%),linear-gradient(140deg,#13141b,#1c1b24_50%,#0e0f14)]',
  },
];

const HOME_RECENTS_LIMIT = 4;

export function buildHomeRecordingCards(
  items: ListRecordingsResponse['items']
): RecordingCardViewModel[] {
  return items.slice(0, HOME_RECENTS_LIMIT).map((recording, index) =>
    buildRecordingCardViewModel({
      id: recording.id,
      title: recording.title,
      state: recording.status,
      createdAt: recording.createdAt,
      primaryAction: {
        label: index === 0 ? 'Open project' : 'Continue',
        href: `/projects/${recording.id}`,
      },
    })
  );
}

export default function useHomeViewModel(): HomeViewModel {
  const router = useRouter();
  const { profile, isLoading } = useSession();
  const [recents, setRecents] = useState<RecordingCardViewModel[]>([]);
  const [recentsLoading, setRecentsLoading] = useState(false);
  const [recentsError, setRecentsError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) {
      setRecents([]);
      setRecentsLoading(false);
      return;
    }

    let active = true;
    setRecentsLoading(true);
    setRecentsError(null);

    RecordingsAPI.listMine(HOME_RECENTS_LIMIT)
      .then((response) => {
        if (!active) return;
        setRecents(buildHomeRecordingCards(response.items ?? []));
      })
      .catch((error) => {
        if (!active) return;
        setRecentsError((error as Error).message || 'Failed to load recent projects.');
      })
      .finally(() => {
        if (!active) return;
        setRecentsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [profile]);

  const latestProjectHref = recents[0]?.href ?? '/projects';

  const onQuickAction = useCallback(
    async (key: Exclude<BusyAction, null>) => {
      setActionError(null);
      setBusyAction(key);

      try {
        if (key === 'record') {
          const { recording } = await RecordingsAPI.create();
          router.push(`/studio/${recording.id}?mode=studio`);
          return;
        }

        if (key === 'edit') {
          router.push(latestProjectHref);
          return;
        }

        if (key === 'go-live') {
          router.push(`/studio/${createRoomId('meet')}?mode=meet`);
          return;
        }

        if (key === 'schedule') {
          router.push('/projects');
          return;
        }

        router.push('/recordings');
      } catch (error) {
        setActionError((error as Error).message || 'Unable to open that workflow.');
      } finally {
        setBusyAction(null);
      }
    },
    [latestProjectHref, router]
  );

  const analyticsData = useMemo<AnalyticsSummaryData | undefined>(() => {
    if (!recents.length) return undefined;

    return {
      totalMinutesRecorded: recents.length * 12,
      episodeCount: recents.length,
      lastRecordingAt: recents[0]?.createdLabel ?? 'Recently',
    };
  }, [recents]);

  return {
    isLoading,
    profileReady: Boolean(profile),
    recents,
    recentsLoading,
    recentsError,
    busyAction,
    actionError,
    analyticsData,
    quickActions: QUICK_ACTIONS,
    aiTools: AI_TOOLS,
    onQuickAction,
  };
}
