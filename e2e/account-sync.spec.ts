import { test, expect } from '@playwright/test';

test('unreachable sign-in service hides OTP form and supports retry', async ({ page }) => {
  let reachable = false;
  await page.route('**/api/v1/auth/capabilities', route => reachable
    ? route.fulfill({ json: { smsAvailable: true } }) : route.abort());
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Retry sign-in' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send code' })).toHaveCount(0);
  reachable = true;
  await page.getByRole('button', { name: 'Retry sign-in' }).click();
  await expect(page.getByRole('button', { name: 'Send code' })).toBeVisible();
});

test('SMS disabled leaves guest scoring available', async ({ page }) => {
  await page.route('**/api/v1/auth/capabilities', (route) =>
    route.fulfill({ json: { smsAvailable: false } }),
  );
  await page.goto('/');
  await expect(page.getByText(/Phone sign-in is temporarily unavailable/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue offline', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start a match', exact: false })).toBeEnabled();
});

test('widget session survives reload and offline logout is revoked on reconnect', async ({
  page,
  context,
}) => {
  const token = 'a'.repeat(43);
  await page.route('**/api/v1/account/dashboard', route => route.fulfill({ json: {
    accountId: 'widget-account', phone: '+919876543210',
    playerProfile: { id: 'profile', name: 'Test player', matchCount: 3 },
    ownedMatchCount: 1, recentMatches: [{ id: 'match', teamA: 'Raiders', teamB: 'Defenders', status: 'LIVE', scoreA: 5, scoreB: 3, updatedAt: Date.now() }],
  } }));
  let revoked = false;
  await page.route('**/api/v1/auth/capabilities', (route) =>
    route.fulfill({ json: { smsAvailable: false, widgetAvailable: true } }),
  );
  await page.route('https://verify.msg91.com/otp-provider.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: 'window.initSendOTP = config => config.success({ message: "mock-widget-proof" });',
    }),
  );
  await page.route('**/api/v1/auth/widget', (route) => {
    const input = route.request().postDataJSON();
    expect(input.accessToken).toBe('mock-widget-proof');
    expect(input.phone).toBeUndefined();
    return route.fulfill({
      json: {
        token,
        accountId: 'widget-account',
        deviceId: input.deviceId,
        expiresAt: Date.now() + 43200000,
      },
    });
  });
  await page.route('**/api/v1/auth/logout', (route) => {
    revoked = true;
    return route.fulfill({ json: { signedOut: true } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in with phone' }).click();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'My player profile' })).toBeVisible();
  await expect(page.getByText('Test player', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByText('Signed out. Local matches remain available.')).toBeVisible();
  await expect(page.getByText('Test player', { exact: true })).toHaveCount(0);
  expect(revoked).toBe(false);
  await context.setOffline(false);
  await expect.poll(() => revoked).toBe(true);
});

test('OTP form binds verification to the same device and signs out', async ({ page }) => {
  let device: { deviceId: string; deviceSecret: string };
  await page.route('**/api/v1/auth/capabilities', (route) =>
    route.fulfill({ json: { smsAvailable: true } }),
  );
  await page.route('**/api/v1/auth/challenges', async (route) => {
    const body = route.request().postDataJSON();
    expect(body.phone).toBe('+919876543210');
    expect(body.deviceSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    device = body;
    await route.fulfill({
      json: {
        challengeId: 'test-challenge',
        expiresAt: Date.now() + 300000,
        resendAfterSeconds: 60,
      },
    });
  });
  await page.route('**/api/v1/auth/verify', async (route) => {
    const body = route.request().postDataJSON();
    expect(body.deviceId).toBe(device.deviceId);
    expect(body.deviceSecret).toBe(device.deviceSecret);
    expect(body.code).toBe('012345');
    await route.fulfill({
      json: {
        token: 'test-token',
        accountId: 'test-account',
        deviceId: device.deviceId,
        expiresAt: Date.now() + 43200000,
      },
    });
  });
  await page.route('**/api/v1/auth/logout', async (route) => {
    expect(route.request().headers().authorization).toBe('Bearer test-token');
    await route.fulfill({ json: { signedOut: true } });
  });
  await page.goto('/');
  await page.getByLabel('Mobile number').fill('9876543210');
  await page.getByRole('button', { name: 'Send code', exact: true }).click();
  await page.getByLabel('Verification code').fill('012345');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(page.getByText('Matches are up to date', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByText('Signed out. Local matches remain available.')).toBeVisible();
});
