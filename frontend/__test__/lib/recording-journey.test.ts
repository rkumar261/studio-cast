import { test } from '@jest/globals';
import assert from 'node:assert/strict';
import {
  consumerStateBadgeClass,
  deriveGuestUploadState,
  deriveHostStudioPhase,
  toConsumerStateLabel,
} from '../../src/lib/recording-journey';

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
  assert.equal(toConsumerStateLabel('ready'), 'Ready');
  assert.match(consumerStateBadgeClass('ready'), /emerald/);
  assert.match(consumerStateBadgeClass('processing'), /cyan/);
  assert.match(consumerStateBadgeClass('uploading'), /amber/);
  assert.match(consumerStateBadgeClass('upload complete'), /violet/);
  assert.match(consumerStateBadgeClass('action required'), /red/);
});

test('deriveHostStudioPhase returns null during prejoin and maps post-stop project handoff states', () => {
  assert.equal(
    deriveHostStudioPhase({
      canControlRecording: false,
      showPreJoin: false,
      isRecording: false,
      sessionBusy: false,
      sessionStopped: false,
      studioState: 'recording',
      projectState: 'recording',
    }),
    null
  );
  assert.equal(
    deriveHostStudioPhase({
      canControlRecording: true,
      showPreJoin: true,
      isRecording: false,
      sessionBusy: false,
      sessionStopped: false,
      studioState: 'recording',
      projectState: 'recording',
    }),
    null
  );
  assert.equal(
    deriveHostStudioPhase({
      canControlRecording: true,
      showPreJoin: false,
      isRecording: false,
      sessionBusy: false,
      sessionStopped: true,
      studioState: 'processing',
      projectState: 'ready',
    }),
    'project_ready'
  );
  assert.equal(
    deriveHostStudioPhase({
      canControlRecording: true,
      showPreJoin: false,
      isRecording: false,
      sessionBusy: false,
      sessionStopped: true,
      studioState: 'processing',
      projectState: 'action required',
    }),
    'project_processing'
  );
  assert.equal(
    deriveHostStudioPhase({
      canControlRecording: true,
      showPreJoin: false,
      isRecording: false,
      sessionBusy: false,
      sessionStopped: true,
      studioState: 'uploading',
      projectState: 'uploading',
    }),
    'uploading_after_stop'
  );
});
