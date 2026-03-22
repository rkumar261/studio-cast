/**
 * Tests for maintenance worker sweep logic.
 *
 * sweepPendingCombinedAssets returns recording IDs whose combined_asset is stuck
 * in 'pending' state with no active (queued or running) jobs. These recordings are
 * retrigger-reconciled on the next maintenance cycle.
 */

import assert from 'node:assert/strict';
import { prisma } from '../../src/lib/prisma.js';

type AnyRecord = Record<string, any>;

function stubMethod(target: AnyRecord, key: string, impl: any): () => void {
  const original = target[key];
  target[key] = impl;
  return () => {
    target[key] = original;
  };
}

// Dynamic import so jest.unstable_mockModule can intercept before module load.
let sweepPendingCombinedAssets: () => Promise<string[]>;

beforeAll(async () => {
  const mod = await import('../../src/workers/maintenance.worker.js');
  sweepPendingCombinedAssets = mod.sweepPendingCombinedAssets;
});

test('sweepPendingCombinedAssets returns empty array when no pending combined assets', async () => {
  const restores: Array<() => void> = [];
  try {
    restores.push(
      stubMethod(prisma.combined_asset, 'findMany', async () => [])
    );

    const result = await sweepPendingCombinedAssets();
    assert.deepEqual(result, []);
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('sweepPendingCombinedAssets returns recording IDs when combined asset is pending with no active jobs', async () => {
  const restores: Array<() => void> = [];
  try {
    restores.push(
      stubMethod(prisma.combined_asset, 'findMany', async () => [
        { recording_id: 'rec-stuck-1' },
        { recording_id: 'rec-stuck-2' },
      ])
    );
    // No active jobs for either recording
    restores.push(
      stubMethod(prisma.job, 'findMany', async () => [])
    );

    const result = await sweepPendingCombinedAssets();
    assert.deepEqual(result.sort(), ['rec-stuck-1', 'rec-stuck-2']);
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('sweepPendingCombinedAssets excludes recordings that have active jobs', async () => {
  const restores: Array<() => void> = [];
  try {
    restores.push(
      stubMethod(prisma.combined_asset, 'findMany', async () => [
        { recording_id: 'rec-active' },
        { recording_id: 'rec-stuck' },
      ])
    );
    // rec-active has an active job; rec-stuck does not
    restores.push(
      stubMethod(prisma.job, 'findMany', async () => [
        { recording_id: 'rec-active' },
      ])
    );

    const result = await sweepPendingCombinedAssets();
    assert.deepEqual(result, ['rec-stuck']);
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});

test('sweepPendingCombinedAssets deduplicates recording IDs', async () => {
  const restores: Array<() => void> = [];
  try {
    // Same recording_id appears twice (two combined assets for one recording)
    restores.push(
      stubMethod(prisma.combined_asset, 'findMany', async () => [
        { recording_id: 'rec-dup' },
        { recording_id: 'rec-dup' },
      ])
    );
    restores.push(
      stubMethod(prisma.job, 'findMany', async () => [])
    );

    const result = await sweepPendingCombinedAssets();
    assert.deepEqual(result, ['rec-dup']);
  } finally {
    for (const restore of restores.reverse()) restore();
  }
});
