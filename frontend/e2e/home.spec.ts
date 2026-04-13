import { expect, test } from '@playwright/test';
import emptyHome from './fixtures/empty-home.json';
import homeWithRecents from './fixtures/home-with-recents.json';
import projectReady from './fixtures/project-ready.json';
import { mockAuthedSession } from './fixtures/auth';

test('signed-out user sees the marketing home', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Create your')).toBeVisible();
  await expect(page.locator('section').getByRole('link', { name: 'Start for free' })).toBeVisible();
});

test('signed-in user sees the dashboard shell and home sections', async ({ page }) => {
  await mockAuthedSession(page, { recordingsList: homeWithRecents });

  await page.goto('/');

  await expect(page.getByTestId('dashboard-quick-actions')).toBeVisible();
  await expect(page.getByTestId('dashboard-recents')).toBeVisible();
  const analyticsPanel = page.getByTestId('dashboard-analytics');
  await expect(analyticsPanel).toBeVisible();
  await expect(analyticsPanel.getByText('Total projects')).toBeVisible();
  await expect(analyticsPanel.getByText('2', { exact: true })).toBeVisible();
  await expect(analyticsPanel.getByText('24 min recorded')).toBeVisible();
  await expect(page.getByTestId('dashboard-ai-tools')).toBeVisible();
  await expect(page.getByTestId('dashboard-workspace-cta')).toBeVisible();
  await expect(page.getByTestId('recent-card-rec_home_1')).toBeVisible();
  await expect(page.locator('[data-testid^="recent-card-"]')).toHaveCount(2);
  await expect(page.locator('img[alt="Raw & RAKESH"]')).toBeVisible();
  await expect(page.getByTestId('ai-tool-translate')).toHaveAttribute('href', '/projects/rec_home_1#transcript');
  await expect(page.getByTestId('ai-tool-magic-audio')).toHaveAttribute('href', '/projects/rec_home_1#tracks');
  await expect(page.getByTestId('ai-tool-clips')).toHaveAttribute('data-disabled', 'true');
  await expect(page.getByRole('link', { name: 'Open latest project' })).toHaveAttribute('href', '/projects/rec_home_1');
  await expect(page.getByRole('link', { name: 'Upload media' })).toHaveAttribute('href', '/projects/new?mode=upload');
});

test('home analytics falls back gracefully when the summary endpoint fails', async ({ page }) => {
  await mockAuthedSession(page, {
    recordingsList: homeWithRecents,
    analyticsStatus: 500,
  });

  await page.goto('/');

  const analyticsPanel = page.getByTestId('dashboard-analytics');
  await expect(analyticsPanel).toBeVisible();
  await expect(analyticsPanel.getByText('Coming soon')).toBeVisible();
});

test('recent cards fall back cleanly when thumbnail loading fails', async ({ page }) => {
  await mockAuthedSession(page, { recordingsList: homeWithRecents });
  await page.route('https://example.com/**', async (route) => {
    await route.fulfill({ status: 404, body: '' });
  });

  await page.goto('/');

  const firstCard = page.getByTestId('recent-card-rec_home_1');
  await expect(firstCard).toBeVisible();
  await expect(firstCard.locator('img')).toHaveCount(0);
  await expect(firstCard.getByText('Raw & RAKESH')).toBeVisible();
});

test('signed-in home handles an empty recent state', async ({ page }) => {
  await mockAuthedSession(page, { recordingsList: emptyHome });

  await page.goto('/');

  await expect(page.getByText('No projects yet.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create project' })).toHaveAttribute('href', '/projects');
  await expect(page.getByTestId('ai-tool-translate')).toHaveAttribute('data-disabled', 'true');
});

test('protected project deep links recover when backend session is valid but marker cookie is missing', async ({
  page,
}) => {
  await mockAuthedSession(page, {
    project: projectReady,
    seedSessionCookie: false,
  });

  await page.goto('/projects/rec_ready');

  await expect(page).toHaveURL(/\/projects\/rec_ready$/);
  await expect(page.getByRole('heading', { name: 'Raw & RAKESH' })).toBeVisible();
});

test('signed-in root honors the pending post-auth redirect cookie', async ({ page }) => {
  await mockAuthedSession(page, { project: projectReady });
  await page.context().addCookies([
    {
      name: 'studio_cast_next',
      value: encodeURIComponent('/projects/rec_ready'),
      domain: '127.0.0.1',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  await page.goto('/');

  await expect(page).toHaveURL(/\/projects\/rec_ready$/);
  await expect(page.getByRole('heading', { name: 'Raw & RAKESH' })).toBeVisible();
});
