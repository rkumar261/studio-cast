import { test, expect } from '@playwright/test';
import { e2eData } from './test-data';

test('guest leave goes to thanks screen, not pre-join', async ({ browser }) => {
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();

    await guestPage.goto(e2eData.guestStudioUrl());

    await expect(
        guestPage.getByText(/join this recording as a guest/i)
    ).toBeVisible();

    await guestPage.getByRole('button', { name: /continue as guest/i }).click();

    await guestPage.getByPlaceholder(/your name \(required\)/i).fill('Guest User');
    await guestPage.getByRole('button', { name: /join as guest/i }).click();

    await expect(
        guestPage.getByText(/people|leave|invite people/i)
    ).toBeVisible();

    await guestPage.getByRole('button', { name: /^leave$/i }).click();

    await guestPage.waitForURL(new RegExp(`/studio/${e2eData.recordingId}/thanks`));

    await expect(
        guestPage.getByText(/uploading|all set!/i)
    ).toBeVisible();

    await expect(
        guestPage.getByText(/join this recording as a guest/i)
    ).toHaveCount(0);

    await guestContext.close();
});