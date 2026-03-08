export type QueueStatus = 'queued' | 'processing' | 'failed';

export type QueueSchedulerItem = {
  id: string;
  recordingId: string;
  trackId: string;
  seq: number;
  status: QueueStatus;
  nextAttemptAt: number;
  createdAt: number;
};

export type QueueRecoveryItem = QueueSchedulerItem & {
  protocol: 'tus' | 'multipart';
  resumableTusId?: string;
  resumableTusUrl?: string;
  resumableTusChunkId?: string;
  resumableTusUploadState?: string;
  updatedAt: number;
};

type QueueRecoveryItemCore = {
  id: string;
  recordingId: string;
  trackId: string;
  seq: number;
  status: QueueStatus;
  protocol: 'tus' | 'multipart';
  nextAttemptAt: number;
  updatedAt: number;
  resumableTusId?: string;
  resumableTusUrl?: string;
  resumableTusChunkId?: string;
  resumableTusUploadState?: string;
};

export type RecoverySnapshot = {
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

export function trackExecutionKey(item: { recordingId: string; trackId: string }): string {
  return `${item.recordingId}:${item.trackId}`;
}

export function selectTrackSerializedBatch<T extends QueueSchedulerItem>(args: {
  items: T[];
  now: number;
  concurrency: number;
  inFlightItemIds: Set<string>;
  inFlightTrackKeys: Set<string>;
}): T[] {
  const eligible = args.items
    .filter((item) => item.status === 'queued' || item.status === 'failed')
    .filter((item) => item.nextAttemptAt <= args.now)
    .filter((item) => !args.inFlightItemIds.has(item.id));

  const pendingByTrack = new Map<string, T[]>();
  for (const item of eligible) {
    const key = trackExecutionKey(item);
    if (args.inFlightTrackKeys.has(key)) continue;
    const existing = pendingByTrack.get(key);
    if (existing) existing.push(item);
    else pendingByTrack.set(key, [item]);
  }

  const candidates: T[] = [];
  for (const trackItems of pendingByTrack.values()) {
    trackItems.sort((a, b) => (a.seq === b.seq ? a.createdAt - b.createdAt : a.seq - b.seq));
    candidates.push(trackItems[0]!);
  }

  candidates.sort((a, b) => (a.seq === b.seq ? a.createdAt - b.createdAt : a.seq - b.seq));
  const availableSlots = Math.max(0, args.concurrency - args.inFlightItemIds.size);
  return candidates.slice(0, availableSlots);
}

export function reconcileTrackRecoveryItems<T extends QueueRecoveryItemCore>(args: {
  items: T[];
  inFlightItemIds: Set<string>;
  snapshot: RecoverySnapshot;
  now: number;
}): {
  deleteIds: string[];
  upserts: T[];
} {
  const targetItems = args.items.filter(
    (item) =>
      item.recordingId === args.snapshot.recordingId &&
      item.trackId === args.snapshot.trackId
  );

  const deleteIds = targetItems
    .filter(
      (item) =>
        item.seq <= args.snapshot.highestContiguousUploadedSeq &&
        !args.inFlightItemIds.has(item.id)
    )
    .map((item) => item.id);

  const upsertById = new Map<string, T>();
  for (const item of targetItems) {
    if (
      item.seq <= args.snapshot.highestExistingSeq &&
      item.seq > args.snapshot.highestContiguousUploadedSeq &&
      item.status === 'failed' &&
      !args.inFlightItemIds.has(item.id)
    ) {
      upsertById.set(item.id, {
        ...item,
        status: 'queued',
        nextAttemptAt: args.now,
        updatedAt: args.now,
      });
    }
  }

  const resumable = args.snapshot.resumableTus;
  if (resumable?.tusUrl || resumable?.tusId) {
    const resumeTarget = targetItems.find(
      (item) =>
        item.protocol === 'tus' &&
        item.seq === resumable.seq &&
        !args.inFlightItemIds.has(item.id)
    );

    if (resumeTarget) {
      const existing = upsertById.get(resumeTarget.id) ?? resumeTarget;
      upsertById.set(resumeTarget.id, {
        ...existing,
        resumableTusId: resumable.tusId,
        resumableTusUrl: resumable.tusUrl,
        resumableTusChunkId: resumable.chunkId,
        resumableTusUploadState: resumable.tusUploadState,
        status: existing.status === 'failed' ? 'queued' : existing.status,
        nextAttemptAt: existing.status === 'failed' ? args.now : existing.nextAttemptAt,
        updatedAt: args.now,
      });
    }
  }

  return {
    deleteIds,
    upserts: Array.from(upsertById.values()),
  };
}

export function selectTusResumeCandidate(args: {
  itemTusUrl?: string;
  itemTusId?: string;
  resumePlanTusUrl?: string;
  resumePlanTusResourceUrl?: string;
  resumePlanTusId?: string;
  endpoint: string;
  buildTusUrlFromId: (tusId: string, endpoint: string) => string;
}): string | undefined {
  if (args.itemTusUrl) return args.itemTusUrl;
  if (args.resumePlanTusResourceUrl) return args.resumePlanTusResourceUrl;
  if (args.resumePlanTusUrl) return args.resumePlanTusUrl;

  const id = args.itemTusId ?? args.resumePlanTusId;
  if (!id) return undefined;
  return args.buildTusUrlFromId(id, args.endpoint);
}
