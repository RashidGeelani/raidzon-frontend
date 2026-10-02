import { test, expect } from '@playwright/test';

test('splash leads to sign-in, guest home has no sign-in form, profile can sign in', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/v1/auth/capabilities', route => route.fulfill({ json: { smsAvailable: true } }));
  await page.goto('/');
  await expect(page.getByRole('status', { name: 'Starting raidzOn' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Welcome to the court' })).toBeVisible();
  await expect(page.getByLabel('Mobile number')).toBeVisible();
  await page.screenshot({ path: 'test-results/signin-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Continue offline', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ready for the next raid?' })).toBeVisible();
  await expect(page.getByLabel('Mobile number')).not.toBeVisible();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(page.getByLabel('Mobile number')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('successful sign-in opens home and restored session skips sign-in', async ({ page }) => {
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = {};
    if (path.endsWith('/capabilities')) json = { smsAvailable: true };
    if (path.endsWith('/challenges')) json = { challengeId: 'test', expiresAt: Date.now() + 300000, resendAfterSeconds: 60 };
    if (path.endsWith('/verify')) json = { token: 'a'.repeat(43), accountId: 'test-account', deviceId: route.request().postDataJSON().deviceId, expiresAt: Date.now() + 3600000 };
    await route.fulfill({ json });
  });
  await page.goto('/');
  await page.getByLabel('Mobile number').fill('9876543210');
  await page.getByRole('button', { name: 'Send code', exact: true }).click();
  await page.getByLabel('Verification code', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ready for the next raid?' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ready for the next raid?' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Welcome to the court' })).toHaveCount(0);
});
