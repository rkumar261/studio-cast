import assert from 'node:assert/strict';
import {
  getRequestPrincipal,
  isGuestPrincipal,
  isUserPrincipal,
} from '../../src/lib/request-principal.js';

test('getRequestPrincipal prefers an existing auth principal', () => {
  const principal = getRequestPrincipal({
    auth: { kind: 'guest', participantId: 'part-1', recordingId: 'rec-1' },
    user: { id: 'user-ignored' },
  } as never);

  assert.deepEqual(principal, {
    kind: 'guest',
    participantId: 'part-1',
    recordingId: 'rec-1',
  });
  assert.equal(isGuestPrincipal(principal), true);
  assert.equal(isUserPrincipal(principal), false);
});

test('getRequestPrincipal falls back to authenticated user or invited guest metadata', () => {
  const userPrincipal = getRequestPrincipal({ user: { id: 'user-1' } } as never);
  assert.deepEqual(userPrincipal, { kind: 'user', userId: 'user-1' });
  assert.equal(isUserPrincipal(userPrincipal), true);

  const guestPrincipal = getRequestPrincipal({
    guest: { participantId: 'part-2', recordingId: 'rec-2' },
  } as never);
  assert.deepEqual(guestPrincipal, {
    kind: 'guest',
    participantId: 'part-2',
    recordingId: 'rec-2',
  });
});

test('getRequestPrincipal returns null when no supported principal shape exists', () => {
  const principal = getRequestPrincipal({
    auth: { kind: 'service' },
    guest: { participantId: 'part-1' },
  } as never);

  assert.equal(principal, null);
  assert.equal(isGuestPrincipal(principal), false);
  assert.equal(isUserPrincipal(principal), false);
});
