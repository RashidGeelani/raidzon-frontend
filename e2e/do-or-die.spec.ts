import { test, expect, type Page } from '@playwright/test';

async function emptyRaid(page: Page, raider: string) {
  await page
    .getByRole('button', { name: new RegExp(`^${raider} `) })
    .first()
    .click();
  await page.getByRole('button', { name: /^Empty/ }).click();
  await page.getByRole('button', { name: 'Confirm raid →', exact: true }).click();
}

test('third empty raid in a row is Do-or-Die: alert, then the raider is out', async ({ page }) => {
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
  for (let round = 1; round <= 2; round++) {
    await emptyRaid(page, `Raider ${round}`);
    await emptyRaid(page, `Warrior ${round}`);
  }
  const alert = page.getByRole('alertdialog', { name: 'Do-or-Die raid for Valley Raiders' });
  await expect(alert).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: '../.local/do-or-die-alert.png' });
  await alert.getByRole('button', { name: /Got it/ }).click();
  await expect(alert).toBeHidden();
  await expect(page.locator('.do-or-die-badge')).toBeVisible();
  await page
    .getByRole('button', { name: /^Raider 3 / })
    .first()
    .click();
  await expect(page.getByRole('button', { name: 'Empty = OUT / bonus' })).toBeVisible();
  await page.getByRole('button', { name: /^Empty/ }).click();
  await expect(page.getByText(/raider out · empty Do-or-Die raid/)).toBeVisible();
  await page.screenshot({ path: '../.local/do-or-die-raid.png' });
  await page.getByRole('button', { name: 'Confirm raid →', exact: true }).click();
  await expect(page.locator('.score-team strong').nth(1)).toHaveText('1');
  await expect(page.getByText('Raider 3 · Do-or-Die failed · raider out')).toBeVisible();
  // City Warriors are now on Do-or-Die too.
  await expect(
    page.getByRole('alertdialog', { name: 'Do-or-Die raid for City Warriors' }),
  ).toBeVisible();
});

test('watchers see a Do-or-Die banner', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const id = '21111111-2222-3333-4444-555555555555';
  const players = (prefix: string) =>
    Array.from({ length: 7 }, (_, i) => ({
      id: `${prefix}${i}`,
      name: `${prefix}${i}`,
      status: 'ACTIVE',
      raidPoints: 0,
      tacklePoints: 0,
    }));
  const view = {
    matchId: id,
    version: 9,
    serverTime: Date.now(),
    lastSyncedAt: Date.now(),
    events: [],
    state: {
      status: 'LIVE',
      phase: 'REGULATION',
      half: 1,
      raidNumber: 5,
      turn: 0,
      winner: null,
      currentRaiderId: null,
      scores: [0, 0],
      tieScores: [0, 0],
      emptyRaids: [2, 2],
      clock: { remainingMs: 1_000_000, startedAt: null },
      raidClock: { remainingMs: 30_000, startedAt: null },
      teams: [
        { name: 'Boniyar Bulls', players: players('a') },
        { name: 'Uri Warriors', players: players('b') },
      ],
    },
  };
  await page.route('**/api/v1/public/matches/**', (route) => route.fulfill({ json: view }));
  await page.routeWebSocket(/\/ws\//, (ws) => ws.send(JSON.stringify({ type: 'view', view })));
  await page.goto(`/watch/${id}`);
  await expect(page.getByRole('status').filter({ hasText: 'DO-OR-DIE RAID' })).toContainText(
    'Boniyar Bulls must score',
  );
  await page.screenshot({ path: '../.local/do-or-die-viewer.png' });
});
