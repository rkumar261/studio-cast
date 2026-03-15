'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as tus from 'tus-js-client';
import { StudioRecordingAPI } from '@/lib/studio/internal-api';
import {
  reconcileTrackRecoveryItems,
  selectTrackSerializedBatch,
  selectTusResumeCandidate,
  trackExecutionKey,
} from './queue-logic';

// Live studio recording uploads are canonicalized to TUS-only.
export type ChunkUploadProtocol = 'tus';
type PersistedChunkUploadProtocol = 'tus' | 'multipart';
type ChunkKind = 'audio' | 'video' | 'screen';
type QueueStatus = 'queued' | 'processing' | 'failed';

export type QueueChunkIntent = {
  recordingId: string;
  trackId: string;
  seq: number;
  kind: ChunkKind;
  protocol: ChunkUploadProtocol;
  blob: Blob;
  bytes: number;
  emittedAt: number;
};

type PersistedQueueItem = {
  id: string;
  recordingId: string;
  trackId: string;
  seq: number;
  kind: ChunkKind;
  protocol: PersistedChunkUploadProtocol;
  blob: Blob;
  bytes: number;
  emittedAt: number;
  attempts: number;
  status: QueueStatus;
  nextAttemptAt: number;
  resumableTusId?: string;
  resumableTusUrl?: string;
  resumableTusChunkId?: string;
  resumableTusUploadState?: string;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
};

type QueueStats = {
  pending: number;
  processing: number;
  failed: number;
  completed: number;
  bytesPending: number;
  bytesProcessing: number;
  bytesFailed: number;
  bytesUploaded: number;
  bytesTotal: number;
};

type UseChunkUploadQueueArgs = {
  enabled: boolean;
  recordingId?: string;
  concurrency?: number;
  maxRetries?: number;
};

export type TrackChunkRecoverySnapshot = {
  recordingId: string;
  trackId: string;
  highestExistingSeq: number;
  highestContiguousUploadedSeq: number;
  resumableTus?: {
    chunkId: string;
    seq: number;
    tusId: string;
    tusUrl?: string;
    tusUploadState?: string;
  };
};

const DB_NAME = 'studio-cast-chunk-queue';
const DB_VERSION = 1;
const STORE_NAME = 'chunks';
const NON_RETRYABLE_HTTP_STATUS = new Set([400, 401, 403, 404, 409, 410, 413, 415, 422]);

function chunkIntentId(intent: {
  recordingId: string;
  trackId: string;
  seq: number;
  protocol: ChunkUploadProtocol;
}): string {
  return `${intent.recordingId}:${intent.trackId}:${intent.seq}:${intent.protocol}`;
}

function openQueueDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment.'));
      return;
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB.'));
  });
}

function withStore<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed.'));
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed.'));
  });
}

function nowMs() {
  return Date.now();
}

function nextBackoffMs(attempt: number): number {
  const base = 500 * Math.pow(2, Math.max(0, attempt - 1));
  return Math.min(base, 30_000);
}

function isLoopbackHost(hostname: string) {
  return hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname === 'localhost';
}

function normalizeTusEndpoint(endpoint?: string | null): string | null {
  const raw = endpoint?.trim();
  if (!raw) return null;
  if (typeof window === 'undefined') return raw;

  try {
    const parsed = new URL(raw, window.location.origin);
    const apiBase = process.env.NEXT_PUBLIC_API_BASE?.trim();
    if (!apiBase) {
      return parsed.toString();
    }

    const apiUrl = new URL(apiBase, window.location.origin);
    if (isLoopbackHost(parsed.hostname)) {
      parsed.protocol = apiUrl.protocol;
      parsed.host = apiUrl.host;
    }
    return parsed.toString();
  } catch {
    return raw;
  }
}

function normalizeTusResourceUrl(uploadUrl: string, endpoint: string): string {
  if (!uploadUrl) return uploadUrl;
  if (typeof window === 'undefined') return uploadUrl;
  try {
    const resolved = new URL(uploadUrl, endpoint);
    const endpointUrl = new URL(endpoint, window.location.origin);
    if (isLoopbackHost(resolved.hostname) && resolved.host !== endpointUrl.host) {
      resolved.protocol = endpointUrl.protocol;
      resolved.host = endpointUrl.host;
    }
    return resolved.toString();
  } catch {
    return uploadUrl;
  }
}

function parseTusIdFromUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  try {
    const cleaned = url.split('?')[0]?.replace(/\/+$/, '');
    const maybeId = cleaned?.split('/').pop()?.trim();
    return maybeId || undefined;
  } catch {
    return undefined;
  }
}

function tusUrlFromId(tusId: string, endpoint: string): string {
  return normalizeTusResourceUrl(`${endpoint}${tusId}`, endpoint);
}

function getStatusFromUploadError(err: unknown): number | null {
  const maybe = err as {
    originalResponse?: {
      getStatus?: () => number;
      getUnderlyingObject?: () => { status?: number } | null;
    };
  };
  const status = maybe?.originalResponse?.getStatus?.();
  if (typeof status === 'number' && status > 0) return status;
  const underlying = maybe?.originalResponse?.getUnderlyingObject?.();
  if (underlying && typeof underlying.status === 'number' && underlying.status > 0) {
    return underlying.status;
  }
  return null;
}

function isHardTusFailure(err: unknown): boolean {
  const status = getStatusFromUploadError(err);
  if (status != null && NON_RETRYABLE_HTTP_STATUS.has(status)) return true;

  const message = (err as Error | undefined)?.message?.toLowerCase() ?? '';
  if (!message) return false;
  if (message.includes('seq mismatch')) return true;
  if (message.includes('did not include tus upload endpoint')) return true;
  if (message.includes('failed to resume upload') && message.includes('response code: n/a')) return true;
  if (message.includes('failed to fetch')) return true;
  return false;
}

function isTusResumeFailure(err: unknown): boolean {
  const message = (err as Error | undefined)?.message?.toLowerCase() ?? '';
  if (!message) return false;
  if (message.includes('failed to resume upload')) return true;
  if (message.includes('method: head')) return true;
  return false;
}

export function useChunkUploadQueue(args: UseChunkUploadQueueArgs) {
  const concurrency = args.concurrency ?? 2;
  const maxRetries = args.maxRetries ?? 8;
  const scopeRecordingId = args.recordingId?.trim() || null;
  const scopePrefix = scopeRecordingId ? `${scopeRecordingId}:` : null;

  const dbRef = useRef<IDBDatabase | null>(null);
  const inFlightRef = useRef<Set<string>>(new Set());
  const inFlightTrackIdsRef = useRef<Set<string>>(new Set());
  const tickTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(false);
  const completedByRecordingRef = useRef<Map<string, { count: number; bytes: number }>>(new Map());
  const progressBytesByIdRef = useRef<Map<string, number>>(new Map());
  const [stats, setStats] = useState<QueueStats>({
    pending: 0,
    processing: 0,
    failed: 0,
    completed: 0,
    bytesPending: 0,
    bytesProcessing: 0,
    bytesFailed: 0,
    bytesUploaded: 0,
    bytesTotal: 0,
  });
  const [lastError, setLastError] = useState<string | null>(null);

  const isItemInScope = useCallback(
    (item: PersistedQueueItem) => !scopeRecordingId || item.recordingId === scopeRecordingId,
    [scopeRecordingId]
  );

  const isIdInScope = useCallback(
    (id: string) => !scopePrefix || id.startsWith(scopePrefix),
    [scopePrefix]
  );

  const scopedInFlightCount = useCallback(() => {
    if (!scopePrefix) return inFlightRef.current.size;
    let count = 0;
    for (const id of inFlightRef.current) {
      if (id.startsWith(scopePrefix)) count += 1;
    }
    return count;
  }, [scopePrefix]);

  const scopedCompleted = useCallback(() => {
    if (scopeRecordingId) {
      const value = completedByRecordingRef.current.get(scopeRecordingId);
      return {
        count: value?.count ?? 0,
        bytes: value?.bytes ?? 0,
      };
    }

    let count = 0;
    let bytes = 0;
    for (const value of completedByRecordingRef.current.values()) {
      count += value.count;
      bytes += value.bytes;
    }
    return { count, bytes };
  }, [scopeRecordingId]);

  const addCompleted = useCallback((recordingId: string, bytes: number) => {
    const current = completedByRecordingRef.current.get(recordingId) ?? { count: 0, bytes: 0 };
    completedByRecordingRef.current.set(recordingId, {
      count: current.count + 1,
      bytes: current.bytes + bytes,
    });
  }, []);

  const refreshStats = useCallback(async () => {
    const db = dbRef.current;
    if (!db) return;
    const all = await withStore<PersistedQueueItem[]>(db, 'readonly', (store) => store.getAll());
    const scoped = all.filter(isItemInScope);
    const processing = scoped.filter((item) => item.status === 'processing').length;
    const failed = scoped.filter((item) => item.status === 'failed').length;
    const pending = scoped.filter((item) => item.status === 'queued').length;
    const bytesPending = scoped
      .filter((item) => item.status === 'queued')
      .reduce((sum, item) => sum + item.bytes, 0);
    const bytesFailed = scoped
      .filter((item) => item.status === 'failed')
      .reduce((sum, item) => sum + item.bytes, 0);
    const bytesProcessing = Array.from(progressBytesByIdRef.current.entries())
      .filter(([id]) => isIdInScope(id))
      .reduce((sum, [, sent]) => sum + sent, 0);
    const completed = scopedCompleted();
    const bytesUploaded = completed.bytes;
    const bytesTotal = bytesPending + bytesFailed + bytesProcessing + bytesUploaded;
    const inFlightCount = scopedInFlightCount();
    setStats({
      pending,
      processing: processing + inFlightCount,
      failed,
      completed: completed.count,
      bytesPending,
      bytesProcessing,
      bytesFailed,
      bytesUploaded,
      bytesTotal,
    });
  }, [isIdInScope, isItemInScope, scopedCompleted, scopedInFlightCount]);

  const markItem = useCallback(async (item: PersistedQueueItem) => {
    const db = dbRef.current;
    if (!db) return;
    await withStore<IDBValidKey>(db, 'readwrite', (store) => store.put(item));
  }, []);

  const deleteItem = useCallback(async (id: string) => {
    const db = dbRef.current;
    if (!db) return;
    await withStore<undefined>(db, 'readwrite', (store) => store.delete(id));
  }, []);

  const runUpload = useCallback(
    async (item: PersistedQueueItem) => {
      if (scopeRecordingId && item.recordingId !== scopeRecordingId) {
        throw new Error('Queue item belongs to a different recording scope.');
      }
      if (item.protocol !== 'tus') {
        throw new Error(
          'Live studio chunk transport is TUS-only. Multipart queue items are deprecated and blocked.'
        );
      }

      const initiated = await StudioRecordingAPI.initiateChunk(item.recordingId, {
        trackId: item.trackId,
        seq: item.seq,
        protocol: 'tus',
        bytesExpected: item.bytes,
      });
      if (initiated.status === 'seq_mismatch') {
        throw new Error(
          `Seq mismatch on initiate (track=${item.trackId}, requested=${item.seq}, nextExpected=${initiated.nextExpectedSeq ?? 'unknown'})`
        );
      }
      if (initiated.already || initiated.chunk?.state === 'uploaded') {
        return;
      }
      if (!initiated.chunk?.id) {
        throw new Error('Chunk initiate response did not include chunk id.');
      }

      const uploadPlan = initiated.uploadPlan;
      const endpoint = normalizeTusEndpoint(uploadPlan?.tusEndpoint);
      if (!endpoint) {
        throw new Error('Chunk initiate response did not include tus upload endpoint.');
      }

      const chunkId =
        item.resumableTusChunkId ??
        initiated.resumeUploadPlan?.chunkId ??
        uploadPlan?.metadata.chunkId ??
        initiated.chunk.id;
      let persistedTusUrl = item.resumableTusUrl;
      let persistedTusId = item.resumableTusId;
      let persistedChunkId = item.resumableTusChunkId;
      const persistResumableIdentity = async (candidateUrl?: string) => {
        if (!candidateUrl) return;
        const normalized = normalizeTusResourceUrl(candidateUrl, endpoint);
        const tusId = parseTusIdFromUrl(normalized);
        if (
          normalized === persistedTusUrl &&
          tusId === persistedTusId &&
          chunkId === persistedChunkId
        ) {
          return;
        }
        persistedTusUrl = normalized;
        persistedTusId = tusId;
        persistedChunkId = chunkId;
        await markItem({
          ...item,
          resumableTusId: tusId,
          resumableTusUrl: normalized,
          resumableTusChunkId: chunkId,
          resumableTusUploadState: 'uploading',
          updatedAt: nowMs(),
        });
      };

      const startTusUpload = (resumeUrl?: string) =>
        new Promise<string>((resolve, reject) => {
          const upload = new tus.Upload(item.blob, {
            endpoint,
            ...(resumeUrl ? { uploadUrl: normalizeTusResourceUrl(resumeUrl, endpoint) } : {}),
            metadata: {
              'chunk-id': chunkId,
              'recording-id': item.recordingId,
              'track-id': item.trackId,
              seq: String(item.seq),
            },
            uploadSize: item.bytes,
            removeFingerprintOnSuccess: true,
            storeFingerprintForResuming: true,
            fingerprint: async () => `${item.recordingId}:${item.trackId}:${item.seq}:tus`,
            retryDelays: [300, 600, 1200, 2500],
            chunkSize: 5 * 1024 * 1024,
            onShouldRetry: (error) => !isHardTusFailure(error),
            onError: (err) => {
              if (upload.url) {
                void persistResumableIdentity(upload.url);
              }
              reject(err);
            },
            onProgress: (sent) => {
              progressBytesByIdRef.current.set(item.id, sent);
              if (upload.url) {
                void persistResumableIdentity(upload.url);
              }
              void refreshStats();
            },
            onSuccess: () => {
              if (upload.url) {
                void persistResumableIdentity(upload.url);
              }
              resolve(normalizeTusResourceUrl(upload.url ?? '', endpoint));
            },
          });

          if (!resumeUrl) {
            void upload.findPreviousUploads().then((previousUploads) => {
              const previous = previousUploads[0];
              if (previous) upload.resumeFromPreviousUpload(previous);
              upload.start();
            }).catch(() => {
              upload.start();
            });
            return;
          }

          upload.start();
        });

      let tusUrl = '';
      const resumeUrl = selectTusResumeCandidate({
        itemTusUrl: item.resumableTusUrl,
        itemTusId: item.resumableTusId,
        resumePlanTusId: initiated.resumeUploadPlan?.tusId,
        resumePlanTusResourceUrl: initiated.resumeUploadPlan?.tusResourceUrl,
        resumePlanTusUrl: initiated.resumeUploadPlan?.tusUrl,
        endpoint,
        buildTusUrlFromId: tusUrlFromId,
      });
      if (resumeUrl) {
        await persistResumableIdentity(resumeUrl);
      }
      if (resumeUrl) {
        try {
          tusUrl = await startTusUpload(resumeUrl);
        } catch (err) {
          if (!isTusResumeFailure(err)) throw err;
          tusUrl = await startTusUpload();
        }
      } else {
        tusUrl = await startTusUpload();
      }

      await StudioRecordingAPI.completeChunk(item.recordingId, initiated.chunk.id, {
        protocol: 'tus',
        bytesReceived: item.bytes,
        tusUrl: tusUrl || undefined,
      });
    },
    [markItem, refreshStats, scopeRecordingId]
  );

  const processItem = useCallback(
    async (item: PersistedQueueItem) => {
      const id = item.id;
      const trackKey = trackExecutionKey(item);
      if (inFlightRef.current.has(id) || inFlightTrackIdsRef.current.has(trackKey)) return;
      inFlightRef.current.add(id);
      inFlightTrackIdsRef.current.add(trackKey);

      try {
        const processingItem: PersistedQueueItem = {
          ...item,
          status: 'processing',
          attempts: item.attempts + 1,
          updatedAt: nowMs(),
        };
        await markItem(processingItem);
        progressBytesByIdRef.current.set(id, 0);
        await refreshStats();

        await runUpload(processingItem);
        await deleteItem(id);
        addCompleted(processingItem.recordingId, processingItem.bytes);
      } catch (err) {
        const message = (err as Error)?.message ?? 'Chunk upload failed';
        setLastError(message);
        const latest =
          dbRef.current == null
            ? undefined
            : await withStore<PersistedQueueItem | undefined>(dbRef.current, 'readonly', (store) =>
                store.get(id)
              );
        const base = latest ?? item;
        const attempts = Math.max(base.attempts, item.attempts + 1);
        const retryBlocked = isHardTusFailure(err);
        const failedItem: PersistedQueueItem = {
          ...base,
          attempts,
          status: 'failed',
          lastError: message,
          nextAttemptAt:
            attempts >= maxRetries || retryBlocked
              ? Number.MAX_SAFE_INTEGER
              : nowMs() + nextBackoffMs(attempts),
          updatedAt: nowMs(),
        };
        await markItem(failedItem);
      } finally {
        progressBytesByIdRef.current.delete(id);
        inFlightRef.current.delete(id);
        inFlightTrackIdsRef.current.delete(trackKey);
      }
    },
    [addCompleted, deleteItem, markItem, maxRetries, refreshStats, runUpload]
  );

  const tick = useCallback(async () => {
    if (!mountedRef.current || !args.enabled) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await refreshStats();
      return;
    }

    const db = dbRef.current;
    if (!db) return;

    const all = await withStore<PersistedQueueItem[]>(db, 'readonly', (store) => store.getAll());
    const now = nowMs();

    const selected = selectTrackSerializedBatch({
      items: all.filter(isItemInScope),
      now,
      concurrency,
      inFlightItemIds: inFlightRef.current,
      inFlightTrackKeys: inFlightTrackIdsRef.current,
    });
    await Promise.all(selected.map((item) => processItem(item)));
    await refreshStats();
  }, [args.enabled, concurrency, isItemInScope, processItem, refreshStats]);

  const enqueue = useCallback(
    async (intent: QueueChunkIntent) => {
      const db = dbRef.current;
      if (!db) {
        throw new Error('Chunk upload queue is not ready yet.');
      }
      if (scopeRecordingId && intent.recordingId !== scopeRecordingId) {
        throw new Error('Chunk intent recording does not match queue recording scope.');
      }

      const id = chunkIntentId(intent);
      const existing = await withStore<PersistedQueueItem | undefined>(db, 'readonly', (store) =>
        store.get(id)
      );

      const item: PersistedQueueItem = {
        id,
        recordingId: intent.recordingId,
        trackId: intent.trackId,
        seq: intent.seq,
        kind: intent.kind,
        protocol: intent.protocol,
        blob: intent.blob,
        bytes: intent.bytes,
        emittedAt: intent.emittedAt,
        attempts: existing?.attempts ?? 0,
        status: 'queued',
        nextAttemptAt: nowMs(),
        resumableTusId: existing?.resumableTusId,
        resumableTusUrl: existing?.resumableTusUrl,
        resumableTusChunkId: existing?.resumableTusChunkId,
        resumableTusUploadState: existing?.resumableTusUploadState,
        createdAt: existing?.createdAt ?? nowMs(),
        updatedAt: nowMs(),
      };

      await withStore<IDBValidKey>(db, 'readwrite', (store) => store.put(item));
      await refreshStats();
      void tick();
    },
    [refreshStats, scopeRecordingId, tick]
  );

  const retryFailed = useCallback(async () => {
    const db = dbRef.current;
    if (!db) return;
    const all = await withStore<PersistedQueueItem[]>(db, 'readonly', (store) => store.getAll());
    const now = nowMs();

    await Promise.all(
      all
        .filter(isItemInScope)
        .filter((item) => item.status === 'failed')
        .map((item) =>
          markItem({
            ...item,
            status: 'queued',
            nextAttemptAt: now,
            updatedAt: now,
          })
        )
    );

    await refreshStats();
    void tick();
  }, [isItemInScope, markItem, refreshStats, tick]);

  const reconcileTrackRecovery = useCallback(
    async (snapshot: TrackChunkRecoverySnapshot) => {
      const db = dbRef.current;
      if (!db) return;
      if (scopeRecordingId && snapshot.recordingId !== scopeRecordingId) return;

      const all = await withStore<PersistedQueueItem[]>(db, 'readonly', (store) => store.getAll());
      const recoveryActions = reconcileTrackRecoveryItems({
        items: all,
        inFlightItemIds: inFlightRef.current,
        snapshot,
        now: nowMs(),
      });

      if (recoveryActions.deleteIds.length > 0) {
        await Promise.all(recoveryActions.deleteIds.map((id) => deleteItem(id)));
      }
      if (recoveryActions.upserts.length > 0) {
        await Promise.all(recoveryActions.upserts.map((item) => markItem(item)));
      }

      await refreshStats();
      void tick();
    },
    [deleteItem, markItem, refreshStats, scopeRecordingId, tick]
  );

  useEffect(() => {
    mountedRef.current = true;

    void openQueueDb()
      .then(async (db) => {
        dbRef.current = db;
        await refreshStats();
        if (args.enabled) void tick();
      })
      .catch((err) => {
        setLastError((err as Error)?.message ?? 'Failed to initialize chunk upload queue.');
      });

    return () => {
      mountedRef.current = false;
      inFlightTrackIdsRef.current.clear();
      if (tickTimerRef.current) {
        window.clearInterval(tickTimerRef.current);
        tickTimerRef.current = null;
      }
      if (dbRef.current) {
        dbRef.current.close();
        dbRef.current = null;
      }
    };
  }, [args.enabled, refreshStats, tick]);

  useEffect(() => {
    if (!args.enabled) {
      if (tickTimerRef.current) {
        window.clearInterval(tickTimerRef.current);
        tickTimerRef.current = null;
      }
      return;
    }

    if (tickTimerRef.current) {
      window.clearInterval(tickTimerRef.current);
    }

    tickTimerRef.current = window.setInterval(() => {
      void tick();
    }, 1500);

    const onOnline = () => {
      void tick();
    };

    window.addEventListener('online', onOnline);
    return () => {
      if (tickTimerRef.current) {
        window.clearInterval(tickTimerRef.current);
        tickTimerRef.current = null;
      }
      window.removeEventListener('online', onOnline);
    };
  }, [args.enabled, tick]);

  const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;

  const queueSummary = useMemo(
    () => ({
      ...stats,
      inFlight: scopedInFlightCount(),
      online: isOnline,
    }),
    [isOnline, scopedInFlightCount, stats]
  );

  return {
    enqueue,
    retryFailed,
    reconcileTrackRecovery,
    stats: queueSummary,
    lastError,
  };
}
