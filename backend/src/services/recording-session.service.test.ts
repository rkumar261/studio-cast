import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma.js';
import {
  startRecordingSessionService,
  stopRecordingSessionService,
} from './recording-session.service.js';

type AnyRecord = Record<string, any>;

function stubMethod(target: AnyRecord, key: string, impl: any): () => void {
  const original = target[key];
  target[key] = impl;
  return () => {
    target[key] = original;
  };
}

test('start session sets canonical recording lifecycle state', async () => {
  const restores: Array<() => void> = [];
  let updateArgs: any;

  try {
    restores.push(
      stubMethod(prisma.recording, 'findUnique', async () => ({
        id: 'rec-1',
        userId: 'owner-1',
        status: 'draft',
        started_at: null,
        stopped_at: null,
        host_participant_id: null,
        control_version: 0,
      }))
    );
    restores.push(
      stubMethod(prisma.participant, 'findFirst', async () => ({ id: 'host-participant-1' }))
    );
    restores.push(
      stubMethod(prisma.recording, 'update', async (args: any) => {
        updateArgs = args;
        return {
          id: 'rec-1',
          status: args.data.status,
          started_at: args.data.started_at,
          stopped_at: args.data.stopped_at,
          host_participant_id: args.data.host_participant_id,
          control_version: 1,
        };
      })
    );

    const result = await startRecordingSessionService({
      recordingId: 'rec-1',
      principal: { kind: 'user', userId: 'owner-1' },
    });

    assert.equal(result.code, 'ok');
    assert.equal(updateArgs.data.lifecycle_state, 'recording');
    assert.equal(updateArgs.data.status, 'uploading');
    assert.equal(updateArgs.data.upload_completed_at, null);
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('stop session moves canonical lifecycle into post-stop uploading', async () => {
  const restores: Array<() => void> = [];
  let updateArgs: any;

  try {
    restores.push(
      stubMethod(prisma.recording, 'findUnique', async () => ({
        id: 'rec-1',
        userId: 'owner-1',
        status: 'uploading',
        lifecycle_state: 'recording',
        started_at: new Date('2026-03-15T04:00:00.000Z'),
        stopped_at: null,
        host_participant_id: 'host-participant-1',
        control_version: 1,
      }))
    );
    restores.push(
      stubMethod(prisma.recording, 'update', async (args: any) => {
        updateArgs = args;
        return {
          id: 'rec-1',
          status: args.data.status,
          started_at: new Date('2026-03-15T04:00:00.000Z'),
          stopped_at: args.data.stopped_at,
          host_participant_id: 'host-participant-1',
          control_version: 2,
        };
      })
    );
    restores.push(
      stubMethod(prisma.track, 'findMany', async () => [])
    );

    const result = await stopRecordingSessionService({
      recordingId: 'rec-1',
      principal: { kind: 'user', userId: 'owner-1' },
    });

    assert.equal(result.code, 'ok');
    assert.equal(updateArgs.data.lifecycle_state, 'post_stop_uploading');
    assert.ok(updateArgs.data.stopped_at instanceof Date);
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});
