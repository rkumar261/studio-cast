import { test, expect } from '@playwright/test';

test('guest invite flow reaches pre-join without login', async ({ browser }) => {
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();

    // Replace with a real invite URL from your app
    await guestPage.goto('http://127.0.0.1:3000/studio/RECORDING_ID?invite=INVITE_TOKEN');

    await expect(
        guestPage.getByText(/join this recording as a guest/i)
    ).toBeVisible();

    await guestPage.getByRole('button', { name: /continue as guest/i }).click();

    await expect(
        guestPage.getByLabel(/your name/i)
    ).toBeVisible();

    await expect(
        guestPage.getByLabel(/email/i)
    ).toBeVisible();

    await guestPage.close();
});