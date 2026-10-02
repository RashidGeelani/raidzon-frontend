import { test, expect } from '@playwright/test';

test('guest browses without signing in and a member follows read-only matches', async ({ page }) => {
  const tournament = { id: 'cup', name: 'City Cup', venue: 'North court', startsOn: '2026-10-10', halfMinutes: 20, raidSeconds: 30 };
  const detail = { tournament, teams: [{ id: 'a', name: 'Raiders', players: ['Player A'] }, { id: 'b', name: 'Defenders', players: [] }], fixtures: [{ id: 'fixture', teamAId: 'a', teamBId: 'b', scheduledAt: null, matchId: 'live-match', status: 'LIVE', scoreA: 12, scoreB: 9 }], standings: [] };
  let joined = false;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = {};
    if (path.endsWith('/auth/capabilities')) json = { smsAvailable: true };
    else if (path.endsWith('/auth/challenges')) json = { challengeId: 'otp', expiresAt: Date.now() + 300000, resendAfterSeconds: 60 };
    else if (path.endsWith('/auth/verify')) json = { token: 'a'.repeat(43), accountId: 'viewer', deviceId: route.request().postDataJSON().deviceId, expiresAt: Date.now() + 43200000 };
    else if (path.endsWith('/public/tournaments')) json = [tournament];
    else if (path.endsWith('/public/tournaments/cup')) json = detail;
    else if (path.endsWith('/account/joined-tournaments')) json = joined ? ['cup'] : [];
    else if (path.endsWith('/tournaments/cup/join')) { joined = true; json = { joined: true }; }
    else if (path.endsWith('/tournaments')) json = [];
    await route.fulfill({ json });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue offline', exact: true }).click();
  await page.getByRole('button', { name: 'Tournaments', exact: true }).click();
  await page.getByLabel('Search tournaments').fill('City');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: /City Cup/ }).click();
  await page.getByRole('tab', { name: 'Matches', exact: true }).click();
  await expect(page.getByText('Raiders vs Defenders', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Register team' })).toHaveCount(0);
  await page.getByLabel('Mobile number').fill('9876543210');
  await page.getByRole('button', { name: 'Send code', exact: true }).click();
  await page.getByLabel('Verification code', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: '+ Create tournament', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /City Cup/ }).click();
  await page.getByRole('button', { name: 'Join tournament', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Joined tournament' })).toBeDisabled();
  await page.getByRole('button', { name: 'Matches', exact: true }).click();
  const section = page.getByRole('region', { name: 'Joined tournament matches' });
  await expect(section.getByText('12 : 9')).toBeVisible();
  await expect(section.getByRole('button')).toHaveCount(0);
});
