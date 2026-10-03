import { test, expect } from '@playwright/test';
test('profile button shows a person icon for guests and initials once signed in', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = [];
    if (path.endsWith('/capabilities')) json = { smsAvailable: true };
    if (path.endsWith('/challenges')) json = { challengeId: 'test', expiresAt: Date.now() + 300000, resendAfterSeconds: 60 };
    if (path.endsWith('/verify')) json = { token: 'a'.repeat(43), accountId: 'acc', deviceId: route.request().postDataJSON().deviceId, expiresAt: Date.now() + 3600000 };
    if (path.endsWith('/account/dashboard')) json = { playerProfile: { name: 'Raashid Geelani' }, ownedMatchCount: 0, recentMatches: [] };
    await route.fulfill({ json });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue offline', exact: true }).click();
  await expect(page.locator('.topbar-profile .avatar-guest')).toBeVisible();
  await page.reload();
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await page.getByLabel('Mobile number').fill('9876543210');
  await page.getByRole('button', { name: 'Send code', exact: true }).click();
  await page.getByLabel('Verification code', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.avatar-initials')).toHaveText('RG');
});
