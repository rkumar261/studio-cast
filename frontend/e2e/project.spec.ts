import { expect, test } from '@playwright/test';
import projectReady from './fixtures/project-ready.json';
import projectProcessing from './fixtures/project-processing.json';
import { mockAuthedSession } from './fixtures/auth';

test('project workspace renders hero, recordings rail, tracks, and artifacts', async ({
  page,
}) => {
  await mockAuthedSession(page, { project: projectReady });

  await page.goto('/projects/rec_ready');

  await expect(page.getByRole('heading', { name: 'Raw & RAKESH' })).toBeVisible();
  await expect(page.getByTestId('project-recordings-rail')).toBeVisible();
  await expect(page.getByTestId('project-tracks-panel')).toBeVisible();
  await expect(page.getByTestId('project-artifacts-panel')).toBeVisible();
  await expect(
    page.getByTestId('project-recordings-rail').getByRole('link', { name: 'All recordings' })
  ).toBeVisible();
});

test('processing project shows the processing banner', async ({ page }) => {
  await mockAuthedSession(page, { project: projectProcessing });

  await page.goto('/projects/rec_processing');

  await expect(page.getByTestId('project-processing-banner')).toBeVisible();
  await expect(page.getByText('Generate participant playback')).toBeVisible();
  await expect(page.getByTestId('project-processing-banner')).toContainText(
    'Processing is still running on your recording.'
  );
});
