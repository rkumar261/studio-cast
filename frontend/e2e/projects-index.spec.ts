import { expect, test } from '@playwright/test';
import archiveList from './fixtures/archive-list.json';
import { mockAuthedSession } from './fixtures/auth';

test('projects nav resolves to the project index instead of the recordings archive', async ({
  page,
}) => {
  await mockAuthedSession(page, { recordingsList: archiveList });

  await page.goto('/projects');

  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
  await expect(page.getByTestId('projects-index-grid')).toBeVisible();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole('link', { name: 'All recordings' })).toBeVisible();
});
