import { test, expect, type Page } from '@playwright/test';

test('player profile shows Super 10 and High 5 counts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = [];
    if (path.endsWith('/capabilities')) json = { smsAvailable: true };
    if (path.endsWith('/challenges'))
      json = { challengeId: 'test', expiresAt: Date.now() + 300000, resendAfterSeconds: 60 };
    if (path.endsWith('/verify'))
      json = {
        token: 'a'.repeat(43),
        accountId: 'acc',
        deviceId: route.request().postDataJSON().deviceId,
        expiresAt: Date.now() + 3600000,
      };
    if (path.endsWith('/account/dashboard'))
      json = {
        accountId: 'acc',
        phone: '+919876543210',
        playerProfile: {
          id: 'p',
          name: 'Aamir Bhat',
          matchCount: 12,
          raidPoints: 96,
          tacklePoints: 31,
          superRaids: 4,
          superTackles: 2,
          superTens: 3,
          highFives: 1,
        },
        tournamentCount: 1,
        teamCount: 1,
        ownedMatchCount: 12,
        recentMatches: [],
      };
    await route.fulfill({ json });
  });
  await page.goto('/');
  await page.getByLabel('Mobile number').fill('9876543210');
  await page.getByRole('button', { name: 'Send code', exact: true }).click();
  await page.getByLabel('Verification code', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Profile' }).click();
  const cards = page.getByLabel('Match milestones');
  await expect(cards.locator('div.super-ten strong')).toHaveText('3');
  await expect(cards.locator('div.high-five strong')).toHaveText('1');
  await expect(cards).toContainText('Super 10');
  await expect(cards).toContainText('High 5');
  await cards.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '../.local/milestones-profile.png' });
});

async function raid(page: Page, raider: string, defenders: string[]) {
  await page
    .getByRole('button', { name: new RegExp(`^${raider} `) })
    .first()
    .click();
  if (defenders.length) {
    await page.getByRole('button', { name: 'Successful', exact: true }).click();
    for (const defender of defenders)
      await page.getByRole('button', { name: new RegExp(`^${defender} On court`) }).click();
  } else await page.getByRole('button', { name: 'Empty / bonus only', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm raid →', exact: true }).click();
}

test('match result tags a top raider who scored a Super 10', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue offline', exact: true }).click();
  await page.getByRole('button', { name: 'Start a match' }).click();
  const names = page.getByLabel('Team name', { exact: true });
  await names.nth(0).fill('Valley Raiders');
  await names.nth(1).fill('City Warriors');
  for (let side = 0; side < 2; side++)
    for (let player = 0; player < 7; player++)
      await page
        .getByLabel(`Team ${side + 1} player ${player + 1} name`, { exact: true })
        .fill(`${side ? 'Warrior' : 'Raider'} ${player + 1}`);
  await page.getByRole('button', { name: 'Start match →', exact: true }).click();
  // Raider 1: 5 touches, then the last 2 defenders (all out), then 4 more after the revival = 11 raid points.
  await raid(page, 'Raider 1', ['Warrior 1', 'Warrior 2', 'Warrior 3', 'Warrior 4', 'Warrior 5']);
  await raid(page, 'Warrior 6', []);
  await raid(page, 'Raider 1', ['Warrior 6', 'Warrior 7']);
  await raid(page, 'Warrior 1', []);
  await raid(page, 'Raider 1', ['Warrior 1', 'Warrior 2', 'Warrior 3', 'Warrior 4']);
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'End first half', exact: true }).click();
  await page.getByRole('button', { name: 'Start second half →', exact: true }).click();
  await page.getByRole('button', { name: 'End regulation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Valley Raiders win' })).toBeVisible();
  const topRaider = page.locator('.result-standout').filter({ hasText: 'Top raider' });
  await expect(topRaider).toContainText('Raider 1');
  await expect(topRaider.locator('.milestone-tag')).toHaveText(['Super 10']);
  await expect(
    page.locator('.result-standout').filter({ hasText: 'Top defender' }).locator('.milestone-tag'),
  ).toHaveCount(0);
  await page.locator('.result-standouts').screenshot({ path: '../.local/milestones-result.png' });
});
