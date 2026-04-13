import { expect, test } from '@playwright/test';
import archiveList from './fixtures/archive-list.json';
import projectReady from './fixtures/project-ready.json';
import { mockAuthedSession } from './fixtures/auth';

function buildArchiveProjectFixture() {
  const fixture = JSON.parse(JSON.stringify(projectReady)) as typeof projectReady;
  fixture.recording.recording.id = 'rec_archive_1';
  fixture.recording.recording.title = 'Weekly interview';
  fixture.projectAssets.project.recordingId = 'rec_archive_1';
  fixture.projectAssets.project.title = 'Weekly interview';
  fixture.projectAssets.project.label = 'Weekly interview';
  fixture.progress.recordingId = 'rec_archive_1';
  return fixture;
}

test('recordings archive renders a simplified list and links to projects', async ({ page }) => {
  await mockAuthedSession(page, { recordingsList: archiveList });

  await page.goto('/recordings');

  await expect(page.getByTestId('recordings-archive-list')).toBeVisible();
  await expect(page.getByText('Weekly interview')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open project' }).first()).toBeVisible();
});

test('recordings archive open-project CTA lands on the canonical project workspace', async ({
  page,
}) => {
  await mockAuthedSession(page, {
    recordingsList: archiveList,
    project: buildArchiveProjectFixture(),
  });

  await page.goto('/recordings');
  await page.getByRole('button', { name: 'Open project' }).first().click();

  await expect(page).toHaveURL(/\/projects\/rec_archive_1$/);
  await expect(page.getByRole('heading', { name: 'Weekly interview' })).toBeVisible();
});
