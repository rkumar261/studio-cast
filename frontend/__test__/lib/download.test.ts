import { afterEach, expect, jest, test } from '@jest/globals';
import assert from 'node:assert/strict';
import { triggerDownloadFromUrl } from '../../src/lib/download';

afterEach(() => {
  jest.useRealTimers();
  document.body.innerHTML = '';
});

test('triggerDownloadFromUrl appends a hidden iframe for the requested URL', () => {
  jest.useFakeTimers();

  triggerDownloadFromUrl('https://cdn.example.com/file.mp4');

  const iframe = document.body.querySelector('iframe');
  assert.ok(iframe);
  assert.equal(iframe?.getAttribute('src'), 'https://cdn.example.com/file.mp4');
  assert.equal((iframe as HTMLIFrameElement).style.display, 'none');
});

test('triggerDownloadFromUrl removes the iframe after the cleanup timeout', () => {
  jest.useFakeTimers();

  triggerDownloadFromUrl('https://cdn.example.com/file.wav');
  expect(document.body.querySelectorAll('iframe')).toHaveLength(1);

  jest.advanceTimersByTime(30_000);

  expect(document.body.querySelectorAll('iframe')).toHaveLength(0);
});
