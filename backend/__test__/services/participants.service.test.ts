import assert from 'node:assert/strict';
import { prisma } from '../../src/lib/prisma.js';
import { claimGuestParticipantService, createParticipantService } from '../../src/services/participants.service.js';

process.env.MAGIC_LINK_BASE_URL ??= 'https://studio.example.com/invite';

type AnyRecord = Record<string, any>;

function stubMethod(target: AnyRecord, key: string, impl: any): () => void {
  const original = target[key];
  target[key] = impl;
  return () => {
    target[key] = original;
  };
}

test('createParticipantService persists guest invite expiry for invite-bound participants', async () => {
  const restores: Array<() => void> = [];
  let createArgs: any = null;

  try {
    restores.push(
      stubMethod(prisma.recording, 'findUnique', async () => ({
        id: 'rec-1',
        userId: 'owner-1',
      }))
    );
    restores.push(
      stubMethod(prisma.participant, 'create', async (args: any) => {
        createArgs = args;
        return {
          id: 'participant-guest-1',
          recording_id: 'rec-1',
          role: 'guest',
          display_name: null,
          email: null,
        };
      })
    );

    const result = await createParticipantService('rec-1', 'owner-1', {
      role: 'guest',
      displayName: 'Guest Invite',
    });

    assert.equal(result.code, 'ok');
    assert.ok(result.data.magicLink);
    assert.equal(typeof createArgs.data.magic_link_hash, 'string');
    assert.ok(createArgs.data.magic_link_hash.length > 16);
    assert.ok(createArgs.data.invite_expires_at instanceof Date);
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('claimGuestParticipantService rejects revoked guest invite tokens', async () => {
  const restores: Array<() => void> = [];

  try {
    restores.push(
      stubMethod(prisma.participant, 'findFirst', async () => ({
        id: 'participant-guest-1',
        recording_id: 'rec-1',
        role: 'guest',
        display_name: null,
        email: null,
        invite_expires_at: new Date('2026-03-20T00:00:00.000Z'),
        invite_revoked_at: new Date('2026-03-14T00:00:00.000Z'),
        invite_claimed_at: null,
      }))
    );

    const result = await claimGuestParticipantService({
      token: 'revoked-token',
    });

    assert.deepEqual(result, { code: 'invalid_token', reason: 'revoked_invite' });
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});
