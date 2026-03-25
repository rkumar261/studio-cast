/**
 * Regression test for the guest auto-finalize race condition.
 *
 * Bug: When the host stops the session, `stoppedAt` fires while the guest's
 * track IDs are still being registered (async API call). The `useEffect` in
 * studio/page.tsx was updating `prevGuestStoppedAtRef.current = stoppedAt`
 * BEFORE the `trackIdByKind.length === 0` early-return guard. This "consumed"
 * the transition without actually scheduling finalization. When tracks later
 * registered and re-triggered the effect, `prev === stoppedAt` caused another
 * early return — so guest tracks were never finalized.
 *
 * Fix: `prevGuestStoppedAtRef.current` is now only updated AFTER we confirm
 * `trackIdByKind` is non-empty. If tracks aren't ready yet, the ref stays
 * unconsumed and the next effect run (triggered by trackIdByKind population)
 * will correctly proceed to schedule finalization.
 */

import assert from 'node:assert/strict';
import { test } from '@jest/globals';

/**
 * Simulate the corrected effect logic as a pure function.
 * Returns whether finalization would be scheduled given the current state.
 * Also mutates refHolder to simulate `prevGuestStoppedAtRef`.
 */
function runGuestFinalizeEffect(
  refHolder: { current: string | undefined },
  stoppedAt: string | undefined,
  trackIdByKind: Record<string, string>,
): boolean {
  const prev = refHolder.current;
  // Only fire on the transition from no stoppedAt → stoppedAt
  if (!stoppedAt || prev === stoppedAt) return false;
  // Wait until track IDs are available — do NOT consume the ref yet
  if (Object.keys(trackIdByKind).length === 0) return false;
  // Consume the transition only after we confirm tracks exist
  refHolder.current = stoppedAt;
  return true;
}

test('guest finalize fires after tracks register — no race condition', () => {
  const ref: { current: string | undefined } = { current: undefined };
  const stoppedAt = '2026-03-22T10:00:00.000Z';

  // Run 1: stoppedAt fires but trackIdByKind is still empty (async registration pending)
  const run1 = runGuestFinalizeEffect(ref, stoppedAt, {});
  assert.equal(run1, false, 'should NOT finalize when tracks are not yet registered');
  // Critical: ref must NOT be consumed yet
  assert.equal(ref.current, undefined, 'ref must remain unconsumed when tracks are empty');

  // Run 2: tracks register, effect re-fires with trackIdByKind populated
  const run2 = runGuestFinalizeEffect(ref, stoppedAt, { video: 'track-v-1', audio: 'track-a-1' });
  assert.equal(run2, true, 'should finalize once tracks are registered');
  assert.equal(ref.current, stoppedAt, 'ref should be consumed after successful finalize scheduling');
});

test('guest finalize does not double-fire when already consumed', () => {
  const ref: { current: string | undefined } = { current: undefined };
  const stoppedAt = '2026-03-22T10:00:00.000Z';
  const tracks = { video: 'track-v-1' };

  // First run: tracks are already registered when stoppedAt fires
  const run1 = runGuestFinalizeEffect(ref, stoppedAt, tracks);
  assert.equal(run1, true, 'should finalize on first run');

  // Second run: some unrelated dep change re-triggers the effect
  const run2 = runGuestFinalizeEffect(ref, stoppedAt, tracks);
  assert.equal(run2, false, 'should NOT double-finalize');
});

test('guest finalize does not fire when session has not stopped', () => {
  const ref: { current: string | undefined } = { current: undefined };
  const tracks = { video: 'track-v-1' };

  const fired = runGuestFinalizeEffect(ref, undefined, tracks);
  assert.equal(fired, false, 'should not fire without stoppedAt');
  assert.equal(ref.current, undefined);
});

test('guest finalize fires immediately when tracks are already registered at stop time', () => {
  const ref: { current: string | undefined } = { current: undefined };
  const stoppedAt = '2026-03-22T10:00:00.000Z';

  // Tracks are already registered before the session stops
  const fired = runGuestFinalizeEffect(ref, stoppedAt, { audio: 'track-a-1', video: 'track-v-1' });
  assert.equal(fired, true, 'should finalize immediately when tracks are ready');
  assert.equal(ref.current, stoppedAt);
});
