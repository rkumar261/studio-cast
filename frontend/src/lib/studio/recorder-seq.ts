export function sanitizeNextSeq(nextSeq: number | undefined): number {
  if (!Number.isFinite(nextSeq)) return 1;
  return Math.max(1, Math.floor(nextSeq));
}

export function seedSeqFromServerTruth(args: {
  seqByTrack: Map<string, number>;
  initialNextSeqByTrack?: Record<string, number>;
}) {
  const seeds = args.initialNextSeqByTrack ?? {};
  for (const [trackId, nextSeq] of Object.entries(seeds)) {
    const safeNextSeq = sanitizeNextSeq(nextSeq);
    const current = args.seqByTrack.get(trackId) ?? 1;
    if (safeNextSeq > current) {
      args.seqByTrack.set(trackId, safeNextSeq);
    }
  }
}

export function consumeNextSeq(args: {
  seqByTrack: Map<string, number>;
  trackId: string;
  initialNextSeqByTrack?: Record<string, number>;
}): number {
  const seededNextSeq = sanitizeNextSeq(args.initialNextSeqByTrack?.[args.trackId]);
  const nextSeq = Math.max(args.seqByTrack.get(args.trackId) ?? 1, seededNextSeq);
  args.seqByTrack.set(args.trackId, nextSeq + 1);
  return nextSeq;
}
