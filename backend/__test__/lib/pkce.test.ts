import assert from 'node:assert/strict';
import { base64url, createPkcePair, sha256 } from '../../src/lib/pkce.js';

test('base64url strips padding and URL-unsafe characters', () => {
  assert.equal(base64url(Uint8Array.from([251, 255, 254])), '-__-');
});

test('sha256 returns a deterministic digest for a verifier string', async () => {
  const digest = await sha256('studio-cast');
  const hex = Buffer.from(digest).toString('hex');
  assert.equal(hex, 'bd327171b9c0bc7f7a7d7a9127d829b95d5ad34ce86557358a98d6188ae03a68');
});

test('createPkcePair produces RFC-style verifier and challenge strings', async () => {
  const pair = await createPkcePair();
  assert.match(pair.verifier, /^[A-Za-z0-9_-]{43,128}$/);
  assert.match(pair.challenge, /^[A-Za-z0-9_-]{43,128}$/);
  assert.notEqual(pair.verifier, pair.challenge);
});
