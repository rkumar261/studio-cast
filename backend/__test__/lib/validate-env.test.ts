import assert from 'node:assert/strict';
import { validateRequiredEnv } from '../../src/lib/validate-env.js';

const originalEnv = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
});

test('validateRequiredEnv accepts explicit R2 endpoint configuration', () => {
  process.env.R2_BUCKET = 'bucket';
  process.env.R2_ACCESS_KEY_ID = 'key';
  process.env.R2_SECRET_ACCESS_KEY = 'secret';
  process.env.R2_PUBLIC_BASE_URL = 'https://cdn.example.com';
  process.env.R2_ENDPOINT = 'https://account.r2.cloudflarestorage.com';
  delete process.env.R2_ACCOUNT_ID;

  expect(() => validateRequiredEnv()).not.toThrow();
});

test('validateRequiredEnv accepts derived endpoint configuration from account id', () => {
  process.env.R2_BUCKET = 'bucket';
  process.env.R2_ACCESS_KEY_ID = 'key';
  process.env.R2_SECRET_ACCESS_KEY = 'secret';
  process.env.R2_PUBLIC_BASE_URL = 'https://cdn.example.com';
  delete process.env.R2_ENDPOINT;
  process.env.R2_ACCOUNT_ID = 'account-123';

  expect(() => validateRequiredEnv()).not.toThrow();
});

test('validateRequiredEnv reports all missing requirements', () => {
  delete process.env.R2_BUCKET;
  delete process.env.R2_ACCESS_KEY_ID;
  delete process.env.R2_SECRET_ACCESS_KEY;
  delete process.env.R2_PUBLIC_BASE_URL;
  delete process.env.R2_ENDPOINT;
  delete process.env.R2_ACCOUNT_ID;

  expect(() => validateRequiredEnv()).toThrow(
    'Missing required environment variables: R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_BASE_URL, R2_ENDPOINT (or R2_ACCOUNT_ID)'
  );
});
