'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RecordingsAPI } from '@/lib/api';

export type ChunkUploadProtocol = 'tus' | 'multipart';
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
};

type UseChunkUploadQueueArgs = {
  enabled: boolean;
  concurrency?: number;
  maxRetries?: number;
};

const DB_NAME = 'studio-cast-chunk-queue';
const DB_VERSION = 1;
const STORE_NAME = 'chunks';

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

export function useChunkUploadQueue(args: UseChunkUploadQueueArgs) {
  const concurrency = args.concurrency ?? 2;
  const maxRetries = args.maxRetries ?? 8;

  const dbRef = useRef<IDBDatabase | null>(null);
  const inFlightRef = useRef<Set<string>>(new Set());
  const tickTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(false);
  const completedCountRef = useRef(0);
  const [stats, setStats] = useState<QueueStats>({
    pending: 0,
    processing: 0,
    failed: 0,
    completed: 0,
  });
  const [lastError, setLastError] = useState<string | null>(null);

  const refreshStats = useCallback(async () => {
    const db = dbRef.current;
    if (!db) return;
    const all = await withStore<PersistedQueueItem[]>(db, 'readonly', (store) => store.getAll());
    const processing = all.filter((item) => item.status === 'processing').length;
    const failed = all.filter((item) => item.status === 'failed').length;
    const pending = all.filter((item) => item.status === 'queued').length;
    setStats({
      pending,
      processing: processing + inFlightRef.current.size,
      failed,
      completed: completedCountRef.current,
    });
  }, []);

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
      if (item.protocol === 'multipart') {
        const initiated = await RecordingsAPI.initiateChunkMultipart(item.recordingId, {
          trackId: item.trackId,
          seq: item.seq,
          bytesExpected: item.bytes,
        });

        await RecordingsAPI.completeChunkMultipart(item.recordingId, initiated.chunk.id, {
          bytesReceived: item.bytes,
          etag: `chunk-${item.seq}`,
          storageKeyRaw: `recordings/${item.recordingId}/tracks/${item.trackId}/chunks/${item.seq}.webm`,
        });
        return;
      }

      const initiated = await RecordingsAPI.initiateChunk(item.recordingId, {
        trackId: item.trackId,
        seq: item.seq,
        protocol: 'tus',
        bytesExpected: item.bytes,
      });

      await RecordingsAPI.completeChunk(item.recordingId, initiated.chunk.id, {
        protocol: 'tus',
        bytesReceived: item.bytes,
        storageKeyRaw: `recordings/${item.recordingId}/tracks/${item.trackId}/chunks/${item.seq}.webm`,
      });
    },
    []
  );

  const processItem = useCallback(
    async (item: PersistedQueueItem) => {
      const id = item.id;
      if (inFlightRef.current.has(id)) return;
      inFlightRef.current.add(id);

      try {
        const processingItem: PersistedQueueItem = {
          ...item,
          status: 'processing',
          attempts: item.attempts + 1,
          updatedAt: nowMs(),
        };
        await markItem(processingItem);

        await runUpload(processingItem);
        await deleteItem(id);
        completedCountRef.current += 1;
      } catch (err) {
        const message = (err as Error)?.message ?? 'Chunk upload failed';
        setLastError(message);
        const attempts = item.attempts + 1;
        const failedItem: PersistedQueueItem = {
          ...item,
          attempts,
          status: 'failed',
          lastError: message,
          nextAttemptAt:
            attempts >= maxRetries ? Number.MAX_SAFE_INTEGER : nowMs() + nextBackoffMs(attempts),
          updatedAt: nowMs(),
        };
        await markItem(failedItem);
      } finally {
        inFlightRef.current.delete(id);
      }
    },
    [deleteItem, markItem, maxRetries, runUpload]
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

    const candidates = all
      .filter((item) => item.nextAttemptAt <= now)
      .filter((item) => item.status === 'queued' || item.status === 'failed')
      .filter((item) => !inFlightRef.current.has(item.id))
      .sort((a, b) => a.seq - b.seq);

    const availableSlots = Math.max(0, concurrency - inFlightRef.current.size);
    const selected = candidates.slice(0, availableSlots);
    await Promise.all(selected.map((item) => processItem(item)));
    await refreshStats();
  }, [args.enabled, concurrency, processItem, refreshStats]);

  const enqueue = useCallback(
    async (intent: QueueChunkIntent) => {
      const db = dbRef.current;
      if (!db) {
        throw new Error('Chunk upload queue is not ready yet.');
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
    [refreshStats, tick]
  );

  const retryFailed = useCallback(async () => {
    const db = dbRef.current;
    if (!db) return;
    const all = await withStore<PersistedQueueItem[]>(db, 'readonly', (store) => store.getAll());
    const now = nowMs();

    await Promise.all(
      all
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
  }, [markItem, refreshStats, tick]);

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
      inFlight: inFlightRef.current.size,
      online: isOnline,
    }),
    [isOnline, stats]
  );

  return {
    enqueue,
    retryFailed,
    stats: queueSummary,
    lastError,
  };
}
