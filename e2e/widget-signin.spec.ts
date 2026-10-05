import { test, expect, type Page } from '@playwright/test';

/**
 * Sign-in through our own form with MSG91 behind it (custom-UI mode). The MSG91 script is replaced
 * by a small fake that behaves like the real one: it draws an "I am human" box into the element we
 * name, and exposes sendOtp / retryOtp / verifyOtp on window.
 */
const FAKE_MSG91 = `
window.initSendOTP = function (config) {
  window.__msg91 = { config: config, sent: [], resent: 0 };
  if (!config.exposeMethods) return;
  var box = document.getElementById(config.captchaRenderId);
  var human = false;
  if (box) box.innerHTML = '<label><input type="checkbox" id="fake-captcha"> I am human</label>';
  document.addEventListener('change', function (e) { if (e.target && e.target.id === 'fake-captcha') human = e.target.checked; });
  window.isCaptchaVerified = function () { return human; };
  window.sendOtp = function (id, ok, fail) {
    if (!human) return setTimeout(function () { fail({ type: 'error', message: 'Captcha verification failed' }); }, 50);
    window.__msg91.sent.push(id); setTimeout(function () { ok({ type: 'success', message: 'req-1' }); }, 50);
  };
  window.retryOtp = function (channel, ok) { window.__msg91.resent++; ok({ type: 'success', message: 'resent' }); };
  window.verifyOtp = function (otp, ok, fail, reqId) {
    setTimeout(function () {
      if (String(otp) === '4321' && reqId === 'req-1') ok({ type: 'success', message: 'msg91-access-token' });
      else fail({ type: 'error', message: 'OTP not match' });
    }, 50);
  };
};`;

async function mockServer(page: Page, widgetScript = FAKE_MSG91) {
  const exchanged: unknown[] = [];
  const saved: unknown[] = [];
  await page.route('https://verify.msg91.com/otp-provider.js', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: widgetScript }),
  );
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = [];
    if (path.endsWith('/auth/capabilities')) json = { smsAvailable: false, widgetAvailable: true };
    if (path.endsWith('/auth/widget')) {
      exchanged.push(route.request().postDataJSON());
      json = { token: 'a'.repeat(43), accountId: 'acc', deviceId: route.request().postDataJSON().deviceId, expiresAt: Date.now() + 3_600_000 };
    }
    if (path.endsWith('/account/dashboard'))
      json = { accountId: 'acc', phone: '+919876543210', playerProfile: { id: 'p', name: 'Aamir', matchCount: 1, raidPoints: 4, tacklePoints: 1, superRaids: 0, superTackles: 0 }, tournamentCount: 0, teamCount: 0, ownedMatchCount: 0, recentMatches: [] };
    if (path.endsWith('/account/player-profile')) saved.push(route.request().postDataJSON());
    if (path.endsWith('/account/notifications')) json = { unread: 0, items: [] };
    await route.fulfill({ json });
  });
  return Object.assign(exchanged, { saved });
}

test('sign in with our own phone form while MSG91 sends the code', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const exchanged = await mockServer(page);
  await page.goto('/');
  await page.getByLabel('Mobile number').fill('98765 43210');
  // MSG91's "I am human" check sits inside our card.
  await expect(page.getByLabel('I am human')).toBeVisible();
  await page.getByRole('button', { name: 'Send code', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Tick “I am human”, then tap send again.');
  await expect(page.getByRole('button', { name: /Verify in the MSG91 window instead/ })).toBeVisible();
  await page.getByLabel('I am human').check();
  await page.getByRole('button', { name: 'Send code', exact: true }).click();
  await expect(page.getByLabel('Verification code', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__msg91.sent)).toEqual(['919876543210']);
  await expect(page.getByText('Sent to +919876543210.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Resend in \d+s$/ })).toBeDisabled();
  await expect(page.getByLabel('I am human')).toBeHidden();
  await page.screenshot({ path: '../.local/widget-signin-code.png' });
  await page.getByLabel('Verification code', { exact: true }).fill('1111');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('OTP not match');
  await page.getByLabel('Verification code', { exact: true }).fill('4321');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('Verification code', { exact: true })).toHaveCount(0);
  expect(exchanged).toHaveLength(1);
  expect((exchanged[0] as { accessToken: string }).accessToken).toBe('msg91-access-token');
  // MSG91's own popup was never used.
  expect(await page.evaluate(() => (window as any).__msg91.config.exposeMethods)).toBe(true);
});

test('changing the number before the code arrives', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockServer(page);
  await page.goto('/');
  await page.getByLabel('Mobile number').fill('9876543210');
  await page.getByLabel('I am human').check();
  await page.getByRole('button', { name: 'Send code', exact: true }).click();
  await page.getByRole('button', { name: 'Change number' }).click();
  await expect(page.getByLabel('Mobile number')).toBeEnabled();
  await expect(page.getByLabel('Verification code', { exact: true })).toHaveCount(0);
});

test('falls back to the MSG91 popup if custom mode does not start', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // A provider script that only knows the popup.
  await mockServer(page, 'window.initSendOTP = function (c) { window.__msg91 = { config: c }; };');
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Verify with phone' })).toBeVisible({ timeout: 15_000 });
});

test('changing the player name re-verifies the phone in our own form', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const calls = await mockServer(page);
  await page.goto('/');
  await page.getByLabel('Mobile number').fill('9876543210');
  await page.getByLabel('I am human').check();
  await page.getByRole('button', { name: 'Send code', exact: true }).click();
  await page.getByLabel('Verification code', { exact: true }).fill('4321');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await page.getByRole('button', { name: 'Edit player name' }).click();
  await page.getByLabel('Player display name').fill('Aamir Bhat');
  // The signed-in number is verified without typing it again.
  await expect(page.getByLabel('Mobile number')).toHaveCount(0);
  await page.getByLabel('I am human').check();
  await page.getByRole('button', { name: 'Send code to verify' }).click();
  await page.getByLabel('Verification code', { exact: true }).fill('4321');
  await page.getByRole('button', { name: 'Verify and save' }).click();
  await expect(page.getByText(/Name updated/)).toBeVisible();
  expect(calls.saved).toEqual([{ name: 'Aamir Bhat', verificationToken: 'a'.repeat(43) }]);
  expect(await page.evaluate(() => (window as any).__msg91.sent)).toEqual(['919876543210']); // the form re-initialises MSG91 for its own captcha
});

test('a ticked box that MSG91 still reports as unticked does not block sending', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // MSG91's status says "not verified" but it accepts the request (seen when a second form shows the check).
  await mockServer(page, FAKE_MSG91.replace('window.isCaptchaVerified = function () { return human; };', 'window.isCaptchaVerified = function () { return false; };'));
  await page.goto('/');
  await page.getByLabel('Mobile number').fill('9876543210');
  await page.getByLabel('I am human').check();
  await page.getByRole('button', { name: 'Send code', exact: true }).click();
  await expect(page.getByLabel('Verification code', { exact: true })).toBeVisible();
});
