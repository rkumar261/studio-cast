import test from 'node:test';
import assert from 'node:assert/strict';
import {
  consumerStateBadgeClass,
  deriveGuestUploadState,
  deriveHostStudioPhase,
  toConsumerStateLabel,
} from './recording-journey';

test('deriveHostStudioPhase keeps host on upload-complete before project handoff', () => {
  assert.equal(
    deriveHostStudioPhase({
      canControlRecording: true,
      showPreJoin: false,
      isRecording: false,
      sessionBusy: false,
      sessionStopped: true,
      studioState: 'upload complete',
      projectState: 'processing',
    }),
    'studio_upload_complete'
  );
});

test('deriveHostStudioPhase marks active recording and stop request explicitly', () => {
  assert.equal(
    deriveHostStudioPhase({
      canControlRecording: true,
      showPreJoin: false,
      isRecording: true,
      sessionBusy: false,
      sessionStopped: false,
      studioState: 'recording',
      projectState: 'recording',
    }),
    'recording_active'
  );
  assert.equal(
    deriveHostStudioPhase({
      canControlRecording: true,
      showPreJoin: false,
      isRecording: true,
      sessionBusy: true,
      sessionStopped: false,
      studioState: 'recording',
      projectState: 'recording',
    }),
    'stop_requested'
  );
});

test('deriveGuestUploadState uses action required when uploads fail', () => {
  assert.equal(deriveGuestUploadState({ pendingUploads: 0, failedUploads: 1 }), 'action required');
  assert.equal(deriveGuestUploadState({ pendingUploads: 2, failedUploads: 0 }), 'uploading');
  assert.equal(deriveGuestUploadState({ pendingUploads: 0, failedUploads: 0 }), 'upload complete');
});

test('consumer recording vocabulary helpers keep labels consumer-facing', () => {
  assert.equal(toConsumerStateLabel('upload complete'), 'Upload complete');
  assert.equal(toConsumerStateLabel('action required'), 'Action required');
  assert.match(consumerStateBadgeClass('processing'), /cyan/);
});
