import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma.js';
import { registerTrackIdentityService } from './track-registration.service.js';

type AnyRecord = Record<string, any>;

function stubMethod(target: AnyRecord, key: string, impl: any): () => void {
  const original = target[key];
  target[key] = impl;
  return () => {
    target[key] = original;
  };
}

test('register track writes canonical track lifecycle state on create', async () => {
  const restores: Array<() => void> = [];
  let createArgs: any;

  try {
    restores.push(
      stubMethod(prisma.recording, 'findUnique', async () => ({
        id: 'rec-1',
        userId: 'owner-1',
      }))
    );
    restores.push(
      stubMethod(prisma.participant, 'findUnique', async () => ({
        id: 'participant-1',
        recording_id: 'rec-1',
      }))
    );
    restores.push(
      stubMethod(prisma.track, 'findFirst', async () => null)
    );
    restores.push(
      stubMethod(prisma.track, 'create', async (args: any) => {
        createArgs = args;
        return {
          id: 'track-1',
          recording_id: args.data.recording_id,
          participant_id: args.data.participant_id,
          kind: args.data.kind,
          codec: args.data.codec,
          state: args.data.state,
          created_at: new Date('2026-03-15T05:00:00.000Z'),
        };
      })
    );

    const result = await registerTrackIdentityService({
      recordingId: 'rec-1',
      principal: { kind: 'user', userId: 'owner-1' },
      body: {
        participantId: 'participant-1',
        kind: 'video',
      },
    });

    assert.equal(result.code, 'ok');
    assert.equal(result.data.existed, false);
    assert.equal(createArgs.data.lifecycle_state, 'recording');
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});
