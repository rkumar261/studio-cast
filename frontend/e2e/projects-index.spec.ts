import { expect, test } from '@playwright/test';
import archiveList from './fixtures/archive-list.json';
import projectReady from './fixtures/project-ready.json';
import { mockAuthedSession } from './fixtures/auth';

function buildProjectsIndexFixture() {
  const fixture = JSON.parse(JSON.stringify(projectReady)) as typeof projectReady;
  fixture.recording.recording.id = 'rec_archive_1';
  fixture.recording.recording.title = 'Weekly interview';
  fixture.projectAssets.project.recordingId = 'rec_archive_1';
  fixture.projectAssets.project.title = 'Weekly interview';
  fixture.projectAssets.project.label = 'Weekly interview';
  fixture.progress.recordingId = 'rec_archive_1';
  return fixture;
}

test('projects nav resolves to the project index instead of the recordings archive', async ({
  page,
}) => {
  await mockAuthedSession(page, { recordingsList: archiveList });

  await page.goto('/projects');

  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
  await expect(page.getByTestId('projects-index-grid')).toBeVisible();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole('link', { name: 'All recordings' })).toBeVisible();
  await expect(page.locator('img[alt="Weekly interview"]')).toBeVisible();
});

test('project cards fall back cleanly when thumbnail loading fails', async ({ page }) => {
  await mockAuthedSession(page, { recordingsList: archiveList });
  await page.route('https://example.com/**', async (route) => {
    await route.fulfill({ status: 404, body: '' });
  });

  await page.goto('/projects');

  const firstCard = page.getByRole('link', { name: /Weekly interview/i }).first();
  await expect(firstCard).toBeVisible();
  await expect(firstCard.locator('img')).toHaveCount(0);
});

test('projects index cards open the canonical project workspace', async ({ page }) => {
  await mockAuthedSession(page, {
    recordingsList: archiveList,
    project: buildProjectsIndexFixture(),
  });

  await page.goto('/projects');
  await page.getByRole('link', { name: /Weekly interview/i }).first().click();

  await expect(page).toHaveURL(/\/projects\/rec_archive_1$/);
  await expect(page.getByRole('heading', { name: 'Weekly interview' })).toBeVisible();
});
