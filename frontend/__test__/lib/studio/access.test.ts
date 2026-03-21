import { test } from '@jest/globals';
import assert from 'node:assert/strict';
import { deriveStudioUiAccess } from '../../../src/lib/studio/access';

test('deriveStudioUiAccess enables host-only controls for hosts', () => {
  assert.deepEqual(deriveStudioUiAccess('host'), {
    canManageParticipants: true,
    canSendInvites: true,
    canUseBroadcastControls: true,
  });
});

test('deriveStudioUiAccess strips host-only controls from guests', () => {
  assert.deepEqual(deriveStudioUiAccess('guest'), {
    canManageParticipants: false,
    canSendInvites: false,
    canUseBroadcastControls: false,
  });
});
