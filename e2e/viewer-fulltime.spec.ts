import { test, expect } from '@playwright/test';

const players = (prefix: string, points: [number, number][]) =>
  points.map(([raidPoints, tacklePoints], i) => ({
    id: `${prefix}${i}`,
    name: `${prefix === 'a' ? 'Raider' : 'Warrior'} ${i + 1}`,
    status: 'ACTIVE',
    raidPoints,
    tacklePoints,
  }));

test('watchers see Super 10 and High 5 tags at full time', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1100 });
  const id = '11111111-2222-3333-4444-555555555555';
  const view = {
    matchId: id,
    version: 40,
    serverTime: Date.now(),
    lastSyncedAt: Date.now(),
    events: [
      { id: 'e1', type: 'END_REGULATION', summary: 'Full time', raidNumber: 40, components: [] },
    ],
    state: {
      status: 'COMPLETED',
      phase: 'REGULATION',
      half: 2,
      raidNumber: 40,
      turn: 0,
      winner: 'TEAM_A', // as the server sends it
      currentRaiderId: null,
      scores: [34, 27],
      tieScores: [0, 0],
      clock: { remainingMs: 0, startedAt: null },
      raidClock: { remainingMs: 30000, startedAt: null },
      teams: [
        {
          name: 'Boniyar Bulls',
          players: players('a', [
            [12, 1],
            [4, 2],
            [1, 6],
            [0, 2],
            [3, 0],
            [0, 1],
            [0, 0],
          ]),
        },
        {
          name: 'Uri Warriors',
          players: players('b', [
            [9, 0],
            [5, 3],
            [0, 2],
            [0, 1],
            [2, 0],
            [0, 0],
            [0, 0],
          ]),
        },
      ],
    },
  };
  await page.route('**/api/v1/public/matches/**', (route) => route.fulfill({ json: view }));
  await page.routeWebSocket(/\/ws\//, (ws) => ws.send(JSON.stringify({ type: 'view', view })));
  await page.goto(`/watch/${id}`);
  const fullTime = page.getByLabel('Full time');
  await expect(fullTime).toContainText('Boniyar Bulls win');
  await expect(
    fullTime
      .locator('.result-standout')
      .filter({ hasText: 'Top raider' })
      .locator('.milestone-tag'),
  ).toHaveText(['Super 10']);
  await expect(
    fullTime
      .locator('.result-standout')
      .filter({ hasText: 'Top defender' })
      .locator('.milestone-tag'),
  ).toHaveText(['High 5']);
  await page.screenshot({ path: '../.local/viewer-fulltime.png', fullPage: true });
});
