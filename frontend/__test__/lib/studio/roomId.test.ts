import { afterEach, jest, test } from '@jest/globals';
import assert from 'node:assert/strict';
import { createRoomId } from '../../../src/lib/studio/roomId';

const originalCrypto = globalThis.crypto;
const originalDateNow = Date.now;
const originalMathRandom = Math.random;

afterEach(() => {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: originalCrypto,
  });
  Date.now = originalDateNow;
  Math.random = originalMathRandom;
  jest.restoreAllMocks();
});

test('createRoomId prefers crypto.randomUUID when available', () => {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      randomUUID: () => 'uuid-1234',
    },
  });

  assert.equal(createRoomId('studio'), 'studio-uuid-1234');
});

test('createRoomId falls back to timestamp and random suffix when crypto.randomUUID is unavailable', () => {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {},
  });
  Date.now = () => 1234567890;
  Math.random = () => 0.123456789;

  assert.equal(createRoomId('studio'), 'studio-1234567890-4fzzzxjy');
});
