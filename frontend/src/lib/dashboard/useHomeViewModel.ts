'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AnalyticsAPI,
  type AnalyticsSummaryResponse,
  RecordingsAPI,
  type ListRecordingsResponse,
} from '@/lib/api';
import { useSession } from '@/lib/useSession';
import { createRoomId } from '@/lib/studio/roomId';
import {
  buildRecordingCardViewModel,
  formatRecordingCreatedLabel,
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
  href?: string;
  ctaLabel: string;
  disabled?: boolean;
};

export type AnalyticsSummaryData = {
  totalMinutesRecorded: number;
  projectCount: number;
  lastRecordingAt?: string;
};

export type HomeSecondaryCtaViewModel = {
  title: string;
  description: string;
  primaryAction: {
    label: string;
    href: string;
  };
  secondaryAction: {
    label: string;
    href: string;
  };
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
  aiToolsExploreHref: string;
  secondaryCta: HomeSecondaryCtaViewModel;
  onQuickAction: (key: Exclude<BusyAction, null>) => Promise<void> | void;
};

const QUICK_ACTIONS: QuickActionViewModel[] = [
  { key: 'record', label: 'Record', caption: 'Create a new studio session' },
  { key: 'edit', label: 'Edit', caption: 'Jump back into a recent project' },
  { key: 'go-live', label: 'Go live', caption: 'Launch an instant meet room' },
  { key: 'schedule', label: 'Schedule', caption: 'Plan upcoming sessions' },
  { key: 'upload', label: 'Upload', caption: 'Import pre-recorded media into a project' },
];

const AI_TOOLS: AiToolCardViewModel[] = [
  {
    id: 'translate',
    title: 'AI Translate',
    description: 'Translate, dub, and localize your finished recordings for new audiences.',
    imageStyle:
      'bg-[radial-gradient(circle_at_20%_20%,rgba(152,109,255,0.55),transparent_35%),linear-gradient(135deg,#17102a,#261547_60%,#0f1020)]',
    ctaLabel: 'Open transcript',
  },
  {
    id: 'magic-audio',
    title: 'Magic Audio',
    description: 'Clean and balance remote audio into a polished studio-quality mix.',
    imageStyle:
      'bg-[linear-gradient(140deg,#101217,#181b22_30%,#0d0f13)]',
    ctaLabel: 'Open tracks',
  },
  {
    id: 'clips',
    title: 'Magic Clips',
    description: 'Generate social-ready cuts from long-form recordings in a few clicks.',
    imageStyle:
      'bg-[radial-gradient(circle_at_65%_35%,rgba(255,255,255,0.16),transparent_25%),linear-gradient(140deg,#13141b,#1c1b24_50%,#0e0f14)]',
    ctaLabel: 'Coming soon',
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
      participantNames: recording.participantNames,
      state: recording.status,
      createdAt: recording.createdAt,
      thumbnailUrl: recording.thumbnailUrl,
      primaryAction: {
        label: index === 0 ? 'Open project' : 'Continue',
        href: `/projects/${recording.id}`,
      },
    })
  );
}

export function buildHomeAiTools(latestProjectHref?: string): AiToolCardViewModel[] {
  return AI_TOOLS.map((tool) => {
    if (tool.id === 'clips') {
      return {
        ...tool,
        disabled: true,
      };
    }

    if (!latestProjectHref) {
      return {
        ...tool,
        disabled: true,
      };
    }

    const href =
      tool.id === 'translate'
        ? `${latestProjectHref}#transcript`
        : `${latestProjectHref}#tracks`;

    return {
      ...tool,
      href,
      disabled: false,
    };
  });
}

export function buildHomeSecondaryCta(
  latestProjectHref?: string
): HomeSecondaryCtaViewModel {
  return latestProjectHref
    ? {
        title: 'Keep the workspace moving',
        description:
          'Jump back into your latest project or upload media into a fresh workspace.',
        primaryAction: {
          label: 'Open latest project',
          href: latestProjectHref,
        },
        secondaryAction: {
          label: 'Upload media',
          href: '/projects/new?mode=upload',
        },
      }
    : {
        title: 'Start your next project',
        description:
          'Create a new project workspace or bring in pre-recorded media to keep shipping.',
        primaryAction: {
          label: 'Create project',
          href: '/projects',
        },
        secondaryAction: {
          label: 'Upload media',
          href: '/projects/new?mode=upload',
        },
      };
}

export function buildHomeAnalyticsData(
  summary?: AnalyticsSummaryResponse | null
): AnalyticsSummaryData | undefined {
  if (!summary) return undefined;

  return {
    totalMinutesRecorded: Math.max(0, summary.totalMinutesRecorded ?? 0),
    projectCount: Math.max(0, summary.projectCount ?? 0),
    lastRecordingAt: summary.lastRecordingAt
      ? formatRecordingCreatedLabel(summary.lastRecordingAt)
      : undefined,
  };
}

export default function useHomeViewModel(): HomeViewModel {
  const router = useRouter();
  const { profile, isLoading } = useSession();
  const [recents, setRecents] = useState<RecordingCardViewModel[]>([]);
  const [recentsLoading, setRecentsLoading] = useState(false);
  const [recentsError, setRecentsError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsSummaryData | undefined>(undefined);

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

  useEffect(() => {
    if (!profile) {
      setAnalyticsData(undefined);
      return;
    }

    let active = true;
    setAnalyticsData(undefined);

    AnalyticsAPI.summary()
      .then((summary) => {
        if (!active) return;
        setAnalyticsData(buildHomeAnalyticsData(summary));
      })
      .catch(() => {
        if (!active) return;
        setAnalyticsData(undefined);
      });

    return () => {
      active = false;
    };
  }, [profile]);

  const latestProjectHref = recents[0]?.href ?? '/projects';
  const latestProjectTarget = recents[0]?.href;

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

        router.push('/projects/new?mode=upload');
      } catch (error) {
        setActionError((error as Error).message || 'Unable to open that workflow.');
      } finally {
        setBusyAction(null);
      }
    },
    [latestProjectHref, router]
  );

  const aiTools = useMemo(
    () => buildHomeAiTools(latestProjectTarget),
    [latestProjectTarget]
  );

  const secondaryCta = useMemo(
    () => buildHomeSecondaryCta(latestProjectTarget),
    [latestProjectTarget]
  );

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
    aiTools,
    aiToolsExploreHref: '/projects',
    secondaryCta,
    onQuickAction,
  };
}
