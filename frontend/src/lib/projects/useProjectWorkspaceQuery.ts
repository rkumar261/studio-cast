'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  RecordingsAPI,
  type GetProjectAssetsGraphResponse,
  type GetRecordingResponse,
  type RecordingProgressResponse,
} from '@/lib/api';

export function useProjectWorkspaceQuery(recordingId?: string) {
  const [recording, setRecording] = useState<GetRecordingResponse | null>(null);
  const [progress, setProgress] = useState<RecordingProgressResponse | null>(null);
  const [projectAssets, setProjectAssets] = useState<GetProjectAssetsGraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectAssetsError, setProjectAssetsError] = useState<string | null>(null);

  const refreshProjectAssets = useCallback(async (id: string) => {
    try {
      const graph = await RecordingsAPI.getProjectAssets(id);
      setProjectAssets(graph);
      setProjectAssetsError(null);
    } catch (projectError) {
      setProjectAssets(null);
      setProjectAssetsError((projectError as Error).message || 'Failed to load project assets.');
    }
  }, []);

  const refreshProject = useCallback(async () => {
    if (!recordingId) return;

    setLoading(true);
    setError(null);

    try {
      const [record, progressResponse] = await Promise.all([
        RecordingsAPI.getById(recordingId),
        RecordingsAPI.getProgress(recordingId).catch(() => null),
      ]);
      setRecording(record);
      setProgress(progressResponse);
      await refreshProjectAssets(recordingId);
    } catch (loadError) {
      setError((loadError as Error).message || 'Failed to load project.');
    } finally {
      setLoading(false);
    }
  }, [recordingId, refreshProjectAssets]);

  useEffect(() => {
    void refreshProject();
  }, [refreshProject]);

  useEffect(() => {
    if (!recordingId) return;

    const pollMs = progress?.projectState === 'processing' ? 1000 : 5000;
    // Poll more aggressively while derivatives are still running so the workspace becomes usable quickly.
    const timer = window.setInterval(async () => {
      const [progressResponse, projectGraph] = await Promise.all([
        RecordingsAPI.getProgress(recordingId).catch(() => null),
        RecordingsAPI.getProjectAssets(recordingId).catch(() => null),
      ]);

      setProgress(progressResponse);
      if (projectGraph) {
        setProjectAssets(projectGraph);
        setProjectAssetsError(null);
      }
    }, pollMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [progress?.projectState, recordingId]);

  return {
    recording,
    setRecording,
    progress,
    projectAssets,
    loading,
    error,
    projectAssetsError,
    refreshProject,
    refreshProjectAssets: () => (recordingId ? refreshProjectAssets(recordingId) : Promise.resolve()),
  };
}
