import { expect, test } from '@playwright/test';
import homeWithRecents from './fixtures/home-with-recents.json';
import { mockAuthedSession } from './fixtures/auth';

test('account avatar shows hover feedback and opens the account popover', async ({ page }) => {
  await mockAuthedSession(page, { recordingsList: homeWithRecents });

  await page.goto('/');

  const trigger = page.getByRole('button', { name: 'Open account menu' });
  await trigger.focus();
  await expect(page.getByTestId('account-trigger-tooltip')).toContainText('Rakesh');

  await trigger.press('Enter');
  await expect(page.getByTestId('account-menu-popover')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
});

test('account popover settings link and logout action both work', async ({ page }) => {
  await mockAuthedSession(page, { recordingsList: homeWithRecents });

  await page.goto('/');

  await page.getByRole('button', { name: 'Open account menu' }).focus();
  await page.getByRole('button', { name: 'Open account menu' }).press('Enter');
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Open account menu' }).focus();
  await page.getByRole('button', { name: 'Open account menu' }).press('Enter');
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('Create your')).toBeVisible();
});
