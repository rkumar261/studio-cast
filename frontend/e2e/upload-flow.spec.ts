import { expect, test } from '@playwright/test';
import emptyHome from './fixtures/empty-home.json';
import projectProcessing from './fixtures/project-processing.json';
import { mockAuthedSession } from './fixtures/auth';

function buildUploadedProjectFixture() {
  const fixture = JSON.parse(JSON.stringify(projectProcessing)) as typeof projectProcessing;
  fixture.recording.recording.id = 'upload_rec_1';
  fixture.recording.recording.title = 'Imported interview';
  fixture.projectAssets.project.recordingId = 'upload_rec_1';
  fixture.projectAssets.project.title = 'Imported interview';
  fixture.projectAssets.project.label = 'Imported interview';
  fixture.progress.recordingId = 'upload_rec_1';
  return fixture;
}

test('home upload quick action opens the projects-first upload entry', async ({ page }) => {
  await mockAuthedSession(page, { recordingsList: emptyHome });

  await page.goto('/');

  await page.getByRole('button', { name: 'Upload' }).click();

  await expect(page).toHaveURL(/\/projects\/new\?mode=upload$/);
  await expect(page.getByRole('heading', { name: 'Upload media into a project' })).toBeVisible();
});

test('upload flow creates a draft project, uploads media, and lands in the project workspace', async ({
  page,
}) => {
  const uploadedProject = buildUploadedProjectFixture();
  await mockAuthedSession(page, {
    recordingsList: emptyHome,
    project: uploadedProject,
  });

  await page.route('**/v1/recordings', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        recording: {
          id: 'upload_rec_1',
          title: 'Imported interview',
          status: 'draft',
          createdAt: '2026-04-02T10:00:00.000Z',
        },
      }),
    });
  });

  await page.route('**/v1/recordings/upload_rec_1/participants', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        participant: {
          id: 'participant_upload_1',
          recordingId: 'upload_rec_1',
          role: 'host',
          displayName: 'Rakesh',
          email: 'rakesh@example.com',
        },
      }),
    });
  });

  await page.route('**/v1/uploads/initiate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        upload: {
          id: 'upload_1',
          trackId: 'track_1',
          protocol: 'multipart',
          state: 'in_progress',
        },
        presignedUrls: ['http://127.0.0.1:3100/__upload__/upload_1/part-1'],
        partSize: 5242880,
      }),
    });
  });

  await page.route('**/__upload__/**', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        ETag: 'etag-part-1',
      },
      body: '',
    });
  });

  await page.route('**/v1/uploads/upload_1/complete', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        jobId: 'job_1',
      }),
    });
  });

  await page.goto('/projects/new?mode=upload');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'imported-interview.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('fake video bytes'),
  });

  await expect(page).toHaveURL(/\/projects\/upload_rec_1$/);
  await expect(page.getByRole('heading', { name: 'Imported interview' })).toBeVisible();
});

test('upload flow surfaces an error and stays on the upload entry when initiation fails', async ({
  page,
}) => {
  await mockAuthedSession(page, { recordingsList: emptyHome });

  await page.route('**/v1/recordings', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        recording: {
          id: 'upload_rec_failed',
          title: 'Broken import',
          status: 'draft',
          createdAt: '2026-04-02T10:00:00.000Z',
        },
      }),
    });
  });

  await page.route('**/v1/recordings/upload_rec_failed/participants', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        participant: {
          id: 'participant_upload_failed',
          recordingId: 'upload_rec_failed',
          role: 'host',
          displayName: 'Rakesh',
          email: 'rakesh@example.com',
        },
      }),
    });
  });

  await page.route('**/v1/uploads/initiate', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'upload_init_failed',
        message: 'Upload initialization failed.',
      }),
    });
  });

  await page.goto('/projects/new?mode=upload');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'broken-import.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('fake video bytes'),
  });

  await expect(page).toHaveURL(/\/projects\/new\?mode=upload$/);
  await expect(page.getByRole('heading', { name: 'Upload media into a project' })).toBeVisible();
  await expect(page.getByText('Upload failed')).toBeVisible();
  await expect(page.getByText('The upload could not be completed.')).toBeVisible();
  await expect(page.getByText('Upload initialization failed.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open draft project' })).toHaveAttribute(
    'href',
    '/projects/upload_rec_failed'
  );
});
