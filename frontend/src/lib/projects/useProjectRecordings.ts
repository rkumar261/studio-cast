'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RecordingsAPI, type ListRecordingsResponse } from '@/lib/api';
import {
  buildRecordingCardViewModel,
  type RecordingCardViewModel,
} from '@/lib/recording-card-view-model';

type UseProjectRecordingsOptions = {
  limit?: number;
  excludeId?: string;
  search?: string;
};

export function buildProjectRecordingCards(
  items: ListRecordingsResponse['items'],
  excludeId?: string
): RecordingCardViewModel[] {
  return items
    .filter((item) => item.id !== excludeId)
    .map((item) =>
      buildRecordingCardViewModel({
        id: item.id,
        title: item.title,
        state: item.status,
        createdAt: item.createdAt,
        primaryAction: {
          label: 'Open project',
          href: `/projects/${item.id}`,
        },
      })
    );
}

export default function useProjectRecordings(options: UseProjectRecordingsOptions = {}) {
  const { limit = 20, excludeId, search = '' } = options;
  const [items, setItems] = useState<RecordingCardViewModel[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (cursor?: string) => {
      if (cursor) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const response = await RecordingsAPI.listMine(limit, cursor);
        const next = buildProjectRecordingCards(response.items ?? [], excludeId);
        setNextCursor(response.nextCursor);
        setItems((current) => (cursor ? [...current, ...next] : next));
      } catch (loadError) {
        setError((loadError as Error).message || 'Failed to load recordings.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [excludeId, limit]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => item.title.toLowerCase().includes(query));
  }, [items, search]);

  return {
    items: filteredItems,
    loading,
    loadingMore,
    error,
    hasMore: Boolean(nextCursor),
    loadMore: () => (nextCursor ? load(nextCursor) : Promise.resolve()),
  };
}
