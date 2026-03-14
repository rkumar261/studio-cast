import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeNextSeq, seedSeqFromServerTruth } from './recorder-seq';

test('refresh/reconnect seeds next seq from server truth', () => {
  const seqByTrack = new Map<string, number>();
  seedSeqFromServerTruth({
    seqByTrack,
    initialNextSeqByTrack: {
      'track-a': 5,
    },
  });

  const first = consumeNextSeq({
    seqByTrack,
    trackId: 'track-a',
    initialNextSeqByTrack: { 'track-a': 5 },
  });
  const second = consumeNextSeq({
    seqByTrack,
    trackId: 'track-a',
    initialNextSeqByTrack: { 'track-a': 5 },
  });

  assert.equal(first, 5);
  assert.equal(second, 6);
});

test('server truth seed does not regress a track that already advanced locally', () => {
  const seqByTrack = new Map<string, number>([['track-a', 12]]);
  seedSeqFromServerTruth({
    seqByTrack,
    initialNextSeqByTrack: {
      'track-a': 5,
    },
  });

  const next = consumeNextSeq({
    seqByTrack,
    trackId: 'track-a',
    initialNextSeqByTrack: { 'track-a': 5 },
  });

  assert.equal(next, 12);
});
