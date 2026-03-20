import assert from 'node:assert/strict';
import {
  normalizeRecordingLifecycleState,
  normalizeTrackLifecycleState,
} from '../../src/lib/lifecycle-state.js';

test('normalizeRecordingLifecycleState maps legacy lifecycle values onto canonical states', () => {
  assert.equal(normalizeRecordingLifecycleState({ lifecycleState: 'preparing' as never }), 'prejoin');
  assert.equal(
    normalizeRecordingLifecycleState({
      lifecycleState: 'uploading' as never,
      stoppedAt: new Date(),
    }),
    'post_stop_uploading'
  );
  assert.equal(
    normalizeRecordingLifecycleState({
      lifecycleState: 'uploading' as never,
      startedAt: new Date(),
    }),
    'recording'
  );
  assert.equal(normalizeRecordingLifecycleState({ lifecycleState: 'failed' as never }), 'blocked');
});

test('normalizeRecordingLifecycleState falls back through status and timestamps', () => {
  assert.equal(normalizeRecordingLifecycleState({ status: 'ready' as never }), 'ready');
  assert.equal(normalizeRecordingLifecycleState({ status: 'processing' as never }), 'processing');
  assert.equal(normalizeRecordingLifecycleState({ status: 'error' as never }), 'blocked');
  assert.equal(
    normalizeRecordingLifecycleState({ uploadCompletedAt: new Date('2026-01-01T00:00:00.000Z') }),
    'upload_complete'
  );
  assert.equal(
    normalizeRecordingLifecycleState({ stoppedAt: new Date('2026-01-01T00:00:00.000Z') }),
    'post_stop_uploading'
  );
  assert.equal(
    normalizeRecordingLifecycleState({ startedAt: new Date('2026-01-01T00:00:00.000Z') }),
    'recording'
  );
  assert.equal(normalizeRecordingLifecycleState({}), 'created');
});

test('normalizeTrackLifecycleState maps both rollout lifecycle values and inferred state', () => {
  assert.equal(normalizeTrackLifecycleState({ lifecycleState: 'registered' as never }), 'recording');
  assert.equal(normalizeTrackLifecycleState({ lifecycleState: 'ingest_ready' as never }), 'ready_for_stitch');
  assert.equal(normalizeTrackLifecycleState({ lifecycleState: 'ready' as never }), 'processed');
  assert.equal(normalizeTrackLifecycleState({ failureReason: 'boom' }), 'blocked');
  assert.equal(normalizeTrackLifecycleState({ storageKeyFinal: 'final.mp4' }), 'processed');
  assert.equal(normalizeTrackLifecycleState({ state: 'uploaded' as never }), 'stitched');
  assert.equal(normalizeTrackLifecycleState({ finalSeq: 7 }), 'finalized');
  assert.equal(
    normalizeTrackLifecycleState({ captureClosedAt: new Date('2026-01-01T00:00:00.000Z') }),
    'capture_closed'
  );
  assert.equal(normalizeTrackLifecycleState({}), 'recording');
});
