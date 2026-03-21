'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StudioRecordingAPI } from '@/lib/studio/internal-api';
import {
  reconcileTrackRecoveryItems,
  selectTrackSerializedBatch,
  trackExecutionKey,
} from './queue-logic';

export type ChunkUploadProtocol = 'presigned_url';
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
  protocol: ChunkUploadProtocol;
  blob: Blob;
  bytes: number;
  emittedAt: number;
  attempts: number;
  status: QueueStatus;
  nextAttemptAt: number;
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
};

const DB_NAME = 'studio-cast-chunk-queue';
const DB_VERSION = 2; // bumped: removed TUS fields from schema
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
      // Drop old store on version upgrade (removes stale TUS items).
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      db.createObjectStore(STORE_NAME, { keyPath: 'id' });
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

function isPresignedUrlExpired(expiresAt: string): boolean {
  // Consider expired if within 30 seconds of expiry to account for clock skew.
  return Date.now() >= new Date(expiresAt).getTime() - 30_000;
}

function isHardFailureStatus(status: number): boolean {
  return NON_RETRYABLE_HTTP_STATUS.has(status);
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
      return { count: value?.count ?? 0, bytes: value?.bytes ?? 0 };
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
    setStats({
      pending,
      processing: processing + scopedInFlightCount(),
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

      // Step 1: initiate — get presigned PUT URL from backend.
      const initiated = await StudioRecordingAPI.initiateChunk(item.recordingId, {
        trackId: item.trackId,
        seq: item.seq,
        protocol: 'presigned_url',
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

      let { uploadPlan } = initiated;
      if (!uploadPlan) {
        throw new Error('Chunk initiate response did not include upload plan.');
      }

      // Step 2: if presigned URL is expired, re-initiate to get a fresh one.
      if (isPresignedUrlExpired(uploadPlan.expiresAt)) {
        const refreshed = await StudioRecordingAPI.initiateChunk(item.recordingId, {
          trackId: item.trackId,
          seq: item.seq,
          protocol: 'presigned_url',
          bytesExpected: item.bytes,
        });
        if (refreshed.already || refreshed.chunk?.state === 'uploaded') return;
        if (!refreshed.uploadPlan) {
          throw new Error('Refreshed initiate response did not include upload plan.');
        }
        uploadPlan = refreshed.uploadPlan;
      }

      // Step 3: PUT the blob directly to R2 via the presigned URL.
      progressBytesByIdRef.current.set(item.id, 0);
      let putRes: Response;
      try {
        putRes = await fetch(uploadPlan.url, {
          method: 'PUT',
          body: item.blob,
          headers: { 'Content-Type': 'video/webm' },
        });
      } catch (err) {
        if (err instanceof TypeError) {
          // CORS misconfiguration or network outage — fetch couldn't reach R2.
          console.error(
            '[studio-cast] R2 PUT blocked. Verify R2 bucket CORS allows PUT from this origin.',
            { key: uploadPlan.key, origin: typeof window !== 'undefined' ? window.location.origin : 'unknown' }
          );
          throw new Error('Upload network error (possible CORS or connectivity issue)');
        }
        throw err;
      }

      progressBytesByIdRef.current.set(item.id, item.bytes);

      if (!putRes.ok) {
        const isHard = isHardFailureStatus(putRes.status);
        const msg = `R2 PUT failed: ${putRes.status}`;
        if (isHard) {
          throw Object.assign(new Error(msg), { hard: true });
        }
        throw new Error(msg);
      }

      // Step 4: notify backend that the chunk is durably in R2.
      await StudioRecordingAPI.completeChunk(item.recordingId, initiated.chunk.id, {
        protocol: 'presigned_url',
        storageKeyRaw: uploadPlan.key,
        bytesReceived: item.bytes,
      });
    },
    [scopeRecordingId]
  );

  const processItem = useCallback(
    async (item: PersistedQueueItem) => {
      const id = item.id;
      const trackKey = trackExecutionKey(item);
      if (inFlightRef.current.has(id) || inFlightTrackIdsRef.current.has(trackKey)) return;
      inFlightRef.current.add(id);
      inFlightTrackIdsRef.current.add(trackKey);

      try {
        await markItem({ ...item, status: 'processing', attempts: item.attempts + 1, updatedAt: nowMs() });
        progressBytesByIdRef.current.set(id, 0);
        await refreshStats();

        await runUpload({ ...item, status: 'processing', attempts: item.attempts + 1, updatedAt: nowMs() });
        await deleteItem(id);
        addCompleted(item.recordingId, item.bytes);
      } catch (err) {
        const message = (err as Error)?.message ?? 'Chunk upload failed';
        const isHard = (err as any)?.hard === true;
        setLastError(message);
        const latest =
          dbRef.current == null
            ? undefined
            : await withStore<PersistedQueueItem | undefined>(dbRef.current, 'readonly', (store) =>
                store.get(id)
              );
        const base = latest ?? item;
        const attempts = Math.max(base.attempts, item.attempts + 1);
        await markItem({
          ...base,
          attempts,
          status: 'failed',
          lastError: message,
          nextAttemptAt:
            attempts >= maxRetries || isHard
              ? Number.MAX_SAFE_INTEGER
              : nowMs() + nextBackoffMs(attempts),
          updatedAt: nowMs(),
        });
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
      if (!db) throw new Error('Chunk upload queue is not ready yet.');
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
        .map((item) => markItem({ ...item, status: 'queued', nextAttemptAt: now, updatedAt: now }))
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
        await Promise.all(recoveryActions.upserts.map((item) => markItem(item as PersistedQueueItem)));
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

    if (tickTimerRef.current) window.clearInterval(tickTimerRef.current);

    tickTimerRef.current = window.setInterval(() => {
      void tick();
    }, 1500);

    const onOnline = () => { void tick(); };
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
    () => ({ ...stats, inFlight: scopedInFlightCount(), online: isOnline }),
    [isOnline, scopedInFlightCount, stats]
  );

  return { enqueue, retryFailed, reconcileTrackRecovery, stats: queueSummary, lastError };
}
