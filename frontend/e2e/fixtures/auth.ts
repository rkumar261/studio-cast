import type { Page } from '@playwright/test';

type ProjectFixture = {
  recording: { recording: { id: string; title?: string; createdAt: string } };
  progress: unknown;
  projectAssets: unknown;
  recordingsList?: unknown;
};

type AnalyticsSummaryFixture = {
  totalMinutesRecorded: number;
  projectCount: number;
  lastRecordingAt: string | null;
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
    analyticsSummary?: AnalyticsSummaryFixture | null;
    analyticsStatus?: number;
    seedSessionCookie?: boolean;
    logoutStatus?: number;
  } = {}
) {
  let signedOut = false;
  const seedSessionCookie = input.seedSessionCookie ?? true;
  const logoutStatus = input.logoutStatus ?? 204;
  const analyticsStatus = input.analyticsStatus ?? 200;

  if (seedSessionCookie) {
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
  }

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
    if (logoutStatus >= 200 && logoutStatus < 300) {
      signedOut = true;
    }
    await route.fulfill({
      status: logoutStatus,
      contentType: 'application/json',
      body: logoutStatus === 204 ? '' : JSON.stringify({ error: 'logout_failed' }),
    });
  });

  await page.route('**/v1/recordings?owner=me**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(input.recordingsList ?? input.project?.recordingsList ?? { items: [] }),
    });
  });

  await page.route('**/v1/analytics/summary', async (route) => {
    if (analyticsStatus >= 400) {
      await route.fulfill({
        status: analyticsStatus,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'analytics_unavailable' }),
      });
      return;
    }

    const list = (input.recordingsList ??
      input.project?.recordingsList ??
      { items: [] }) as { items?: Array<{ createdAt?: string }> };

    const derivedSummary: AnalyticsSummaryFixture = {
      totalMinutesRecorded: Math.max(0, (list.items?.length ?? 0) * 12),
      projectCount: list.items?.length ?? 0,
      lastRecordingAt: list.items?.[0]?.createdAt ?? null,
    };

    await route.fulfill({
      status: analyticsStatus,
      contentType: 'application/json',
      body: JSON.stringify(input.analyticsSummary ?? derivedSummary),
    });
  });

  if (input.project) {
    const recordingId = input.project.recording.recording.id;
    let recordingTitle = input.project.recording.recording.title;

    await page.route(`**/v1/recordings/${recordingId}`, async (route) => {
      if (route.request().method() === 'PATCH') {
        const payload = route.request().postDataJSON() as { title?: string };
        recordingTitle = payload.title?.trim() || recordingTitle;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            recording: {
              ...input.project?.recording.recording,
              title: recordingTitle,
            },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          recording: {
            ...input.project?.recording.recording,
            title: recordingTitle,
          },
        }),
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
