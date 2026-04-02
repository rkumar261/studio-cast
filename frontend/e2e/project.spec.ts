import { expect, test } from '@playwright/test';
import projectReady from './fixtures/project-ready.json';
import projectProcessing from './fixtures/project-processing.json';
import { mockAuthedSession } from './fixtures/auth';

test('project workspace renders the active layout with hero, flat track list, and transcript tools', async ({
  page,
}) => {
  await mockAuthedSession(page, { project: projectReady });

  await page.goto('/projects/rec_ready');

  await expect(page.getByRole('heading', { name: 'Raw & RAKESH' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open studio' })).toBeVisible();
  await expect(page.getByText('Tracks', { exact: true })).toBeVisible();
  await expect(page.getByText('Transcript', { exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Edit transcript' })).toBeVisible();
});

test('processing project shows the slim processing banner', async ({ page }) => {
  await mockAuthedSession(page, { project: projectProcessing });

  await page.goto('/projects/rec_processing');

  await expect(page.getByTestId('project-processing-banner')).toBeVisible();
  await expect(page.getByTestId('project-processing-banner')).toContainText(
    'Processing is still running on your recording.'
  );
  await expect(page.getByText('1 pending')).toBeVisible();
});

test('project title can be renamed inline', async ({ page }) => {
  await mockAuthedSession(page, { project: projectReady });

  await page.goto('/projects/rec_ready');

  await page.getByRole('button', { name: 'Raw & RAKESH' }).click();
  const input = page.getByLabel('Project title');
  await input.fill('Rakesh & Raw Man');
  await input.press('Enter');

  await expect(page.getByRole('button', { name: 'Rakesh & Raw Man' })).toBeVisible();
  await expect(page.locator('header')).toContainText('Rakesh & Raw Man');
});

test('project workspace keeps captions single and transcript out of the flat list', async ({ page }) => {
  await mockAuthedSession(page, { project: projectProcessing });

  await page.goto('/projects/rec_processing');

  await expect(page.getByText('Captions', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Transcript', { exact: true })).toHaveCount(1);
});
