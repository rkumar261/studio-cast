import { expect, test, type Page } from '@playwright/test';
import homeWithRecents from './fixtures/home-with-recents.json';
import { mockAuthedSession } from './fixtures/auth';

function desktopSidebar(page: Page) {
  return page.getByTestId('desktop-workspace-sidebar');
}

test('account avatar shows hover feedback and opens the account popover', async ({ page }) => {
  await mockAuthedSession(page, { recordingsList: homeWithRecents });

  await page.goto('/');

  const sidebar = desktopSidebar(page);
  const trigger = sidebar.getByRole('button', { name: 'Open account menu' });
  await trigger.focus();
  await expect(sidebar.getByTestId('account-trigger-tooltip')).toContainText('Rakesh');

  await trigger.press('Enter');
  await expect(sidebar.getByTestId('account-menu-popover')).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Settings' })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'Logout' })).toBeVisible();
});

test('account popover settings link and logout action both work', async ({ page }) => {
  await mockAuthedSession(page, { recordingsList: homeWithRecents });

  await page.goto('/');

  const sidebar = desktopSidebar(page);
  const trigger = sidebar.getByRole('button', { name: 'Open account menu' });

  await trigger.focus();
  await trigger.press('Enter');
  await sidebar.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();

  await trigger.focus();
  await trigger.press('Enter');
  await sidebar.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('Create your')).toBeVisible();
});

test('logout surfaces an error when the backend rejects the request', async ({ page }) => {
  await mockAuthedSession(page, {
    recordingsList: homeWithRecents,
    logoutStatus: 500,
  });

  await page.goto('/');

  const sidebar = desktopSidebar(page);
  const trigger = sidebar.getByRole('button', { name: 'Open account menu' });

  await trigger.focus();
  await trigger.press('Enter');
  await sidebar.getByRole('button', { name: 'Logout' }).click();

  await expect(sidebar.getByTestId('account-menu-popover')).toContainText(
    'Logout failed with status 500'
  );
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('dashboard-quick-actions')).toBeVisible();
});
