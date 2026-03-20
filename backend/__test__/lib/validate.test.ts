import assert from 'node:assert/strict';
import { z } from 'zod';
import { validate } from '../../src/lib/validate.js';

test('validate parses and assigns all supported request sections', async () => {
  const req: any = {
    body: { count: '3' },
    query: { limit: '5' },
    params: { recordingId: 'rec-1' },
    headers: { 'x-api-key': 'secret' },
  };
  const reply: any = {
    code: () => reply,
    send: () => reply,
  };

  await validate({
    body: z.object({ count: z.coerce.number() }),
    query: z.object({ limit: z.coerce.number() }),
    params: z.object({ recordingId: z.string().min(1) }),
    headers: z.object({ 'x-api-key': z.string().min(1) }),
  })(req, reply);

  assert.deepEqual(req.body, { count: 3 });
  assert.deepEqual(req.query, { limit: 5 });
  assert.deepEqual(req.params, { recordingId: 'rec-1' });
  assert.deepEqual(req.headers, { 'x-api-key': 'secret' });
});

test('validate returns a 400 payload for zod validation errors', async () => {
  const req: any = {
    body: { count: 'nope' },
  };
  const sent: Array<unknown> = [];
  const reply: any = {
    statusCode: 200,
    code(code: number) {
      this.statusCode = code;
      return this;
    },
    send(payload: unknown) {
      sent.push(payload);
      return this;
    },
  };

  await validate({
    body: z.object({ count: z.coerce.number() }),
  })(req, reply);

  assert.equal(reply.statusCode, 400);
  assert.deepEqual(sent, [
    {
      error: 'validation_error',
      issues: [{ path: ['count'], message: 'Invalid input: expected number, received NaN' }],
    },
  ]);
});

test('validate rethrows non-zod parsing failures', async () => {
  const req: any = { body: 'bad' };
  const reply: any = {
    code: () => reply,
    send: () => reply,
  };

  await expect(
    validate({
      body: {
        parse() {
          throw new Error('unexpected_failure');
        },
      } as never,
    })(req, reply)
  ).rejects.toThrow('unexpected_failure');
});
