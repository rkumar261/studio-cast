import { expect, test } from '@playwright/test';
import emptyHome from './fixtures/empty-home.json';
import homeWithRecents from './fixtures/home-with-recents.json';
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
  await expect(page.getByTestId('dashboard-analytics')).toBeVisible();
  await expect(page.getByTestId('dashboard-ai-tools')).toBeVisible();
  await expect(page.getByTestId('recent-card-rec_home_1')).toBeVisible();
  await expect(page.locator('[data-testid^="recent-card-"]')).toHaveCount(2);
  await expect(page.locator('img[alt="Raw & RAKESH"]')).toBeVisible();
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
});
