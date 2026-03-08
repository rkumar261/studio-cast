type ChunkForContiguity = {
  seq: number;
  state: string;
  storage_key_raw: string | null;
};

type SequenceMetricsArgs = {
  chunks: ChunkForContiguity[];
  finalSeq: number | null;
  captureClosedAt: Date | null;
};

export type TrackSequenceMetrics = {
  highestSeq: number;
  highestContiguousSeq: number;
  missingSeqs: number[];
  expectedTotal: number | null;
  finalized: boolean;
};

export type TrackUploadCompleteness =
  | {
      complete: true;
      reason: 'complete';
      missingSeqs: number[];
      incompleteSeqs: number[];
      metrics: TrackSequenceMetrics;
    }
  | {
      complete: false;
      reason: 'not_finalized' | 'invalid_final_seq' | 'missing_chunks' | 'chunks_not_uploaded';
      missingSeqs: number[];
      incompleteSeqs: number[];
      metrics: TrackSequenceMetrics;
    };

export type TrackStitchReadiness =
  | {
      ready: true;
      reason: 'ready';
      missingSeqs: number[];
      incompleteSeqs: number[];
      metrics: TrackSequenceMetrics;
    }
  | {
      ready: false;
      reason:
        | 'already_stitched'
        | 'not_finalized'
        | 'invalid_final_seq'
        | 'missing_chunks'
        | 'chunks_not_uploaded';
      missingSeqs: number[];
      incompleteSeqs: number[];
      metrics: TrackSequenceMetrics;
    };

function buildChunkBySeq(chunks: ChunkForContiguity[]) {
  const bySeq = new Map<number, ChunkForContiguity>();
  for (const chunk of chunks) {
    if (!bySeq.has(chunk.seq)) bySeq.set(chunk.seq, chunk);
  }
  return bySeq;
}

export function computeTrackSequenceMetrics(args: SequenceMetricsArgs): TrackSequenceMetrics {
  const bySeq = buildChunkBySeq(args.chunks);
  const highestSeq = args.chunks.reduce((max, chunk) => Math.max(max, chunk.seq), 0);
  const finalized = !!args.captureClosedAt && args.finalSeq != null;
  const expectedTotal = finalized ? Math.max(args.finalSeq ?? 0, 0) : null;

  let highestContiguousSeq = 0;
  for (let seq = 1; seq <= highestSeq; seq += 1) {
    if (!bySeq.has(seq)) break;
    highestContiguousSeq = seq;
  }

  const missingUpperBound = expectedTotal ?? highestSeq;
  const missingSeqs: number[] = [];
  for (let seq = 1; seq <= missingUpperBound; seq += 1) {
    if (!bySeq.has(seq)) missingSeqs.push(seq);
  }

  return {
    highestSeq,
    highestContiguousSeq,
    missingSeqs,
    expectedTotal,
    finalized,
  };
}

export function evaluateTrackUploadCompleteness(args: SequenceMetricsArgs): TrackUploadCompleteness {
  const metrics = computeTrackSequenceMetrics(args);
  const finalSeq = args.finalSeq ?? 0;

  if (!metrics.finalized) {
    return {
      complete: false,
      reason: 'not_finalized',
      missingSeqs: [],
      incompleteSeqs: [],
      metrics,
    };
  }

  if (finalSeq <= 0) {
    return {
      complete: false,
      reason: 'invalid_final_seq',
      missingSeqs: [],
      incompleteSeqs: [],
      metrics,
    };
  }

  const bySeq = buildChunkBySeq(args.chunks);
  const missingSeqs: number[] = [];
  const incompleteSeqs: number[] = [];

  for (let seq = 1; seq <= finalSeq; seq += 1) {
    const chunk = bySeq.get(seq);
    if (!chunk) {
      missingSeqs.push(seq);
      continue;
    }
    if (chunk.state !== 'uploaded' || !chunk.storage_key_raw) {
      incompleteSeqs.push(seq);
    }
  }

  if (missingSeqs.length > 0) {
    return {
      complete: false,
      reason: 'missing_chunks',
      missingSeqs,
      incompleteSeqs,
      metrics,
    };
  }

  if (incompleteSeqs.length > 0) {
    return {
      complete: false,
      reason: 'chunks_not_uploaded',
      missingSeqs,
      incompleteSeqs,
      metrics,
    };
  }

  return {
    complete: true,
    reason: 'complete',
    missingSeqs,
    incompleteSeqs,
    metrics,
  };
}

export function evaluateTrackStitchReadiness(args: {
  storageKeyRaw: string | null;
  chunks: ChunkForContiguity[];
  finalSeq: number | null;
  captureClosedAt: Date | null;
}): TrackStitchReadiness {
  const completeness = evaluateTrackUploadCompleteness({
    chunks: args.chunks,
    finalSeq: args.finalSeq,
    captureClosedAt: args.captureClosedAt,
  });

  if (args.storageKeyRaw) {
    return {
      ready: false,
      reason: 'already_stitched',
      missingSeqs: completeness.missingSeqs,
      incompleteSeqs: completeness.incompleteSeqs,
      metrics: completeness.metrics,
    };
  }

  if (!completeness.complete) {
    return {
      ready: false,
      reason: completeness.reason,
      missingSeqs: completeness.missingSeqs,
      incompleteSeqs: completeness.incompleteSeqs,
      metrics: completeness.metrics,
    };
  }

  return {
    ready: true,
    reason: 'ready',
    missingSeqs: completeness.missingSeqs,
    incompleteSeqs: completeness.incompleteSeqs,
    metrics: completeness.metrics,
  };
}
