import { expect, test } from '@playwright/test';
import archiveList from './fixtures/archive-list.json';
import { mockAuthedSession } from './fixtures/auth';

test('recordings archive renders a simplified list and links to projects', async ({ page }) => {
  await mockAuthedSession(page, { recordingsList: archiveList });

  await page.goto('/recordings');

  await expect(page.getByTestId('recordings-archive-list')).toBeVisible();
  await expect(page.getByText('Weekly interview')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open project' }).first()).toBeVisible();
});
