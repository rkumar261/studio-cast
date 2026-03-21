import { test, expect } from '@playwright/test';
import { e2eData } from './test-data';

test('PROJECT-ASSET-001 owner project page keeps combined output primary and participant assets first-class', async ({ browser }) => {
    test.skip(!e2eData.ownerAccessToken, 'Set E2E_OWNER_ACCESS_TOKEN to run the owner project-page smoke.');

    const ownerContext = await browser.newContext();
    await ownerContext.addCookies([
        {
            name: 'access_token',
            value: e2eData.ownerAccessToken!,
            url: e2eData.apiBaseUrl(),
            path: '/',
            httpOnly: true,
            sameSite: 'Lax',
        },
    ]);

    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto(e2eData.projectUrl());

    await expect(ownerPage.getByRole('heading', { name: /project assets/i })).toBeVisible();
    await expect(ownerPage.getByText(/primary output/i)).toBeVisible();
    await expect(ownerPage.getByText(/participant outputs/i)).toBeVisible();
    await expect(ownerPage.getByText(/transcript, captions, and exports/i)).toBeVisible();
    await expect(ownerPage.getByText(/all participants/i)).toBeVisible();
    await expect(ownerPage.getByText(/minimum ready|minimum ready pending/i)).toBeVisible();

    await ownerContext.close();
});
