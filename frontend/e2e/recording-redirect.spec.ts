import { expect, test } from '@playwright/test';
import projectReady from './fixtures/project-ready.json';
import { mockAuthedSession } from './fixtures/auth';

test('legacy recording detail routes redirect to canonical project routes', async ({ page }) => {
  await mockAuthedSession(page, { project: projectReady });

  await page.goto('/recordings/rec_ready');

  await expect(page).toHaveURL(/\/projects\/rec_ready$/);
});
