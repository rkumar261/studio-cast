import { test, expect } from '@playwright/test';

test('guest invite flow reaches pre-join without login', async ({ browser }) => {
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();

    // Replace these with a real recording id + invite token from your app
    const recordingId = 'REPLACE_RECORDING_ID';
    const inviteToken = 'REPLACE_INVITE_TOKEN';

    await guestPage.goto(`/studio/${recordingId}?invite=${inviteToken}`);

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

    // Name required
    await guestPage.getByRole('button', { name: /join as guest/i }).click();

    // This check may need adjustment depending on your validation text
    await expect(guestPage.getByText(/required/i)).toBeVisible();

    await guestPage.getByLabel(/your name/i).fill('Guest User');
    await guestPage.getByRole('button', { name: /join as guest/i }).click();

    // Adjust this assertion to something stable in your studio UI
    await expect(
        guestPage.getByText(/people|leave|recording/i)
    ).toBeVisible();

    await guestContext.close();
});