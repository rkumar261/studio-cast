import { expect, test } from '@playwright/test';
import homeWithRecents from './fixtures/home-with-recents.json';
import projectReady from './fixtures/project-ready.json';
import { mockAuthedSession } from './fixtures/auth';

test.describe('mobile authenticated layout', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('uses the mobile workspace nav on home', async ({ page }) => {
    await mockAuthedSession(page, { recordingsList: homeWithRecents });

    await page.goto('/');

    await expect(page.getByTestId('mobile-workspace-nav-shell')).toBeVisible();
    await expect(page.getByTestId('desktop-workspace-sidebar')).toBeHidden();
    await expect(page.getByTestId('mobile-nav-home')).toBeVisible();
    await expect(page.getByTestId('mobile-nav-projects')).toBeVisible();
    await expect(page.getByTestId('mobile-nav-upload')).toHaveAttribute(
      'href',
      '/projects/new?mode=upload'
    );
    await expect(page.getByRole('button', { name: 'Open account menu' })).toBeVisible();
    await expect(page.getByTestId('dashboard-quick-actions')).toBeVisible();
    await expect(page.getByTestId('dashboard-recents')).toBeVisible();
  });

  test('keeps tracks below the hero preview on project pages', async ({ page }) => {
    await mockAuthedSession(page, { project: projectReady });

    await page.goto('/projects/rec_ready');

    const hero = page.getByTestId('project-hero-preview');
    const tracks = page.getByTestId('project-track-list');

    await expect(hero).toBeVisible();
    await expect(tracks).toBeVisible();

    const heroBox = await hero.boundingBox();
    const tracksBox = await tracks.boundingBox();

    expect(heroBox).not.toBeNull();
    expect(tracksBox).not.toBeNull();
    expect((tracksBox?.y ?? 0) > (heroBox?.y ?? 0) + (heroBox?.height ?? 0) - 1).toBeTruthy();
  });
});
