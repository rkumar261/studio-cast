import assert from 'node:assert/strict';
import {
  buildParticipantMasterKey,
  isPublicDeliverableStorageKey,
  toPublicAssetUrl,
} from '../../src/lib/public-assets.js';

const originalBaseUrl = process.env.R2_PUBLIC_BASE_URL;

afterEach(() => {
  process.env.R2_PUBLIC_BASE_URL = originalBaseUrl;
});

test('isPublicDeliverableStorageKey accepts all supported deliverable patterns', () => {
  assert.equal(
    isPublicDeliverableStorageKey('recordings/rec-1/participants/part-1/master.mp4'),
    true
  );
  assert.equal(
    isPublicDeliverableStorageKey('/recordings/rec-1/combined/all-participants.wav'),
    true
  );
  assert.equal(
    isPublicDeliverableStorageKey('recordings/rec-1/exports/export-1/render.mp4'),
    true
  );
  assert.equal(
    isPublicDeliverableStorageKey('recordings/rec-1/transcript/latest.json'),
    true
  );
  assert.equal(
    isPublicDeliverableStorageKey('recordings/rec-1/tracks/track-1/final/video.mp4'),
    true
  );
  assert.equal(isPublicDeliverableStorageKey('recordings/rec-1/private/tmp.mov'), false);
  assert.equal(isPublicDeliverableStorageKey(null), false);
});

test('toPublicAssetUrl returns undefined for invalid keys or missing base URL', () => {
  delete process.env.R2_PUBLIC_BASE_URL;
  assert.equal(toPublicAssetUrl('recordings/rec-1/participants/part-1/master.mp4'), undefined);

  process.env.R2_PUBLIC_BASE_URL = 'https://cdn.example.com/base/';
  assert.equal(toPublicAssetUrl('recordings/rec-1/private/tmp.mov'), undefined);
  assert.equal(
    toPublicAssetUrl('/recordings/rec-1/participants/part-1/master.mp4'),
    'https://cdn.example.com/base/recordings/rec-1/participants/part-1/master.mp4'
  );
});

test('buildParticipantMasterKey returns the canonical participant master location', () => {
  assert.equal(
    buildParticipantMasterKey({
      recordingId: 'rec-1',
      participantId: 'part-1',
      extension: '.wav',
    }),
    'recordings/rec-1/participants/part-1/master.wav'
  );
});
