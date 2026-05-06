'use client';

import { useCallback, useState } from 'react';
import { API_BASE, ExportsAPI, RecordingsAPI, type ProjectAssetActionDto } from '@/lib/api';
import { triggerDownloadFromUrl } from '@/lib/download';

export function useProjectWorkspaceActions(args: {
  recordingId?: string;
  setRecording: (recording: Awaited<ReturnType<typeof RecordingsAPI.getById>>) => void;
}) {
  const { recordingId, setRecording } = args;
  const [assetActionBusyId, setAssetActionBusyId] = useState<string | null>(null);
  const [assetActionError, setAssetActionError] = useState<string | null>(null);

  const handleAssetAction = useCallback(async (action: ProjectAssetActionDto) => {
    setAssetActionBusyId(action.id);
    setAssetActionError(null);

    try {
      if (action.kind === 'open_url') {
        window.open(action.href, '_blank', 'noopener,noreferrer');
        return;
      }

      if (action.kind === 'api' && action.href.startsWith('/v1/exports/')) {
        const exportId = action.href.split('/').pop();
        if (!exportId) return;
        const result = await ExportsAPI.getById(exportId);
        if (result.downloadUrl) {
          triggerDownloadFromUrl(result.downloadUrl);
        } else {
          triggerDownloadFromUrl(`${API_BASE}${action.href}`);
        }
        return;
      }

      if (action.kind === 'api') {
        triggerDownloadFromUrl(`${API_BASE}${action.href}`);
      }
    } catch (actionError) {
      setAssetActionError((actionError as Error).message || 'Action failed.');
    } finally {
      setAssetActionBusyId(null);
    }
  }, []);

  const renameTitle = useCallback(
    async (title: string) => {
      if (!recordingId) return;
      const renamed = await RecordingsAPI.rename(recordingId, title);
      setRecording(renamed);
    },
    [recordingId, setRecording]
  );

  return {
    assetActionBusyId,
    assetActionError,
    handleAssetAction,
    renameTitle,
  };
}
