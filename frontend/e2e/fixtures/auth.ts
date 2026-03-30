import type { Page } from '@playwright/test';

type ProjectFixture = {
  recording: { recording: { id: string; title?: string; createdAt: string } };
  progress: unknown;
  projectAssets: unknown;
  recordingsList?: unknown;
};

const DEFAULT_USER = {
  user: {
    id: 'user_e2e',
    email: 'rakesh@example.com',
    name: 'Rakesh',
    imageUrl: '',
  },
};

const DEFAULT_TRANSCRIPT = {
  recordingId: 'e2e-recording',
  transcript: {
    state: 'ready',
    revision: 1,
    language: 'en',
    sourceType: 'machine',
    segmentCount: 1,
    publishedAt: '2026-03-30T08:00:00.000Z',
  },
  segments: [
    {
      id: 'seg_1',
      recordingId: 'e2e-recording',
      trackId: null,
      startMs: 0,
      endMs: 1200,
      text: 'Welcome to Studio Cast.',
      speaker: 'Host',
      confidence: 0.98,
    },
  ],
};

export async function mockAuthedSession(
  page: Page,
  input: {
    recordingsList?: unknown;
    project?: ProjectFixture;
  } = {}
) {
  let signedOut = false;

  await page.context().addCookies([
    {
      name: 'studio_cast_session',
      value: '1',
      domain: '127.0.0.1',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  await page.route('**/auth/me', async (route) => {
    if (signedOut) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'unauthorized' }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(DEFAULT_USER),
    });
  });

  await page.route('**/auth/logout', async (route) => {
    signedOut = true;
    await route.fulfill({
      status: 204,
      body: '',
    });
  });

  await page.route('**/v1/recordings?owner=me**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(input.recordingsList ?? input.project?.recordingsList ?? { items: [] }),
    });
  });

  if (input.project) {
    const recordingId = input.project.recording.recording.id;

    await page.route(`**/v1/recordings/${recordingId}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(input.project?.recording),
      });
    });

    await page.route(`**/v1/recordings/${recordingId}/progress`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(input.project?.progress),
      });
    });

    await page.route(`**/v1/recordings/${recordingId}/project-assets`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(input.project?.projectAssets),
      });
    });

    await page.route(`**/v1/recordings/${recordingId}/transcript`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...DEFAULT_TRANSCRIPT,
          recordingId,
          segments: DEFAULT_TRANSCRIPT.segments.map((segment) => ({
            ...segment,
            recordingId,
          })),
        }),
      });
    });
  }
}
