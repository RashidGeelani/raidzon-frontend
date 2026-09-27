import { test, expect } from '@playwright/test';

test('profile name edit re-verifies the phone without replacing the active session', async ({
  page,
}) => {
  let name = 'Original Player';
  let verifications = 0;
  let saved = false;
  const activeToken = 'a'.repeat(43);
  const proofToken = 'b'.repeat(43);
  await page.route('**/api/v1/auth/capabilities', (route) =>
    route.fulfill({ json: { smsAvailable: true, widgetAvailable: false } }),
  );
  await page.route('**/api/v1/auth/challenges', (route) => {
    expect(route.request().postDataJSON().phone).toBe('+919876543210');
    return route.fulfill({
      json: { challengeId: 'challenge', expiresAt: Date.now() + 300000, resendAfterSeconds: 60 },
    });
  });
  await page.route('**/api/v1/auth/verify', (route) => {
    verifications++;
    return route.fulfill({
      json: {
        token: verifications === 1 ? activeToken : proofToken,
        accountId: 'player-account',
        deviceId: route.request().postDataJSON().deviceId,
        expiresAt: Date.now() + 43200000,
      },
    });
  });
  await page.route('**/api/v1/account/assignments', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/account/dashboard', (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${activeToken}`);
    return route.fulfill({
      json: {
        accountId: 'player-account',
        phone: '+919876543210',
        playerProfile: { id: 'profile', name, matchCount: 2 },
        ownedMatchCount: 0,
        recentMatches: [],
      },
    });
  });
  await page.route('**/api/v1/account/player-profile', (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${activeToken}`);
    expect(route.request().postDataJSON()).toEqual({
      name: 'Updated Player',
      verificationToken: proofToken,
    });
    name = 'Updated Player';
    saved = true;
    return route.fulfill({ json: {} });
  });
  await page.route('**/api/v1/auth/logout', (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${proofToken}`);
    return route.fulfill({ json: { signedOut: true } });
  });
  await page.goto('/');
  await page.locator('.account-sync summary').click();
  await page.getByLabel('Mobile number').fill('9876543210');
  await page.getByRole('button', { name: 'Send code', exact: true }).click();
  await page.getByLabel('Verification code', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Verify & sync' }).click();
  await page.getByRole('button', { name: 'Edit player name' }).click();
  await page.getByLabel('Player display name').fill('Updated Player');
  await page.getByRole('button', { name: 'Verify phone and save' }).click();
  expect(saved).toBe(false);
  await page.getByLabel('Profile verification code').fill('654321');
  await page.getByRole('button', { name: 'Verify phone and save' }).click();
  await expect(
    page.getByText('Player name updated. Recorded match rosters are unchanged.'),
  ).toBeVisible();
  await expect(page.getByText('Updated Player', { exact: true })).toBeVisible();
  expect(verifications).toBe(2);
  await page.reload();
  await page.locator('.account-sync summary').click();
  await expect(page.getByText('Updated Player', { exact: true })).toBeVisible();
});
