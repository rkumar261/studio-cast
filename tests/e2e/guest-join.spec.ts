import { test, expect } from '@playwright/test';
import { e2eData } from './test-data';

test('guest invite flow reaches studio without login', async ({ browser }) => {
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();

    const tokenResponses: number[] = [];
    const progressResponses: number[] = [];
    const refreshRequests: string[] = [];

    guestPage.on('response', async (response) => {
        const url = response.url();
        if (url.includes('/v1/livekit/token')) tokenResponses.push(response.status());
        if (url.includes(`/v1/recordings/${e2eData.recordingId}/progress`)) {
            progressResponses.push(response.status());
        }
    });

    guestPage.on('request', (request) => {
        if (request.url().includes('/auth/refresh')) {
            refreshRequests.push(request.url());
        }
    });

    await guestPage.goto(e2eData.guestStudioUrl());

    await expect(
        guestPage.getByText(/join this recording as a guest/i)
    ).toBeVisible();

    await guestPage.getByRole('button', { name: /continue as guest/i }).click();

    const nameInput = guestPage.getByPlaceholder(/your name \(required\)/i);
    const emailInput = guestPage.getByPlaceholder(/email \(optional\)/i);
    const joinButton = guestPage.getByRole('button', { name: /join as guest/i });

    await expect(nameInput).toBeVisible();
    await expect(emailInput).toBeVisible();

    await joinButton.click();

    await expect(guestPage.getByText(/name is required|required/i)).toBeVisible();

    await nameInput.fill('Guest User');
    await joinButton.click();

    await expect(
        guestPage.getByText(/people|leave|invite people/i)
    ).toBeVisible();

    expect(tokenResponses.some((status) => status === 200)).toBeTruthy();
    expect(refreshRequests.length).toBe(0);

    if (progressResponses.length > 0) {
        expect(progressResponses.every((status) => status === 200)).toBeTruthy();
    }

    await guestContext.close();
});