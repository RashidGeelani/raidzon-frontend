import { test, expect, type Page, type Route } from '@playwright/test';

const MATCH = '11111111-2222-3333-4444-555555555555';

async function raid(page: Page, raider: string, defender?: string) {
  await page
    .getByRole('button', { name: new RegExp(`^${raider} `) })
    .first()
    .click();
  if (defender) {
    await page.getByRole('button', { name: 'Successful', exact: true }).click();
    await page.getByRole('button', { name: new RegExp(`^${defender} On court`) }).click();
  } else await page.getByRole('button', { name: 'Empty / bonus only', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm raid →', exact: true }).click();
}

async function quickMatch(page: Page) {
  await page.getByRole('button', { name: 'Start a match' }).click();
  await page.getByRole('button', { name: 'Quick match: fill blank names' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Practice match' })).toBeVisible();
  await page.getByRole('button', { name: 'Start match →', exact: true }).click();
}

test('a quick match with filled-in names is a practice match', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue offline', exact: true }).click();
  await page.getByRole('button', { name: 'Start a match' }).click();
  await page.getByRole('button', { name: 'Quick match: fill blank names' }).click();
  await page.screenshot({ path: '../.local/practice-setup.png' });
  await page.getByRole('button', { name: 'Back to matches' }).click();
  await quickMatch(page);
  await expect(page.locator('.live-view-header .practice-tag')).toHaveText('PRACTICE');
  await raid(page, 'A player 1', 'B player 1');
  page.on('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'End first half', exact: true }).click();
  await page.getByRole('button', { name: 'Start second half →', exact: true }).click();
  await page.getByRole('button', { name: 'End regulation', exact: true }).click();
  await expect(page.locator('.live-view-header .live-status')).toHaveText('COMPLETED');
  // A finished match can't be deleted.
  await expect(page.getByRole('button', { name: 'Delete match' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to matches' }).click();
  await expect(page.locator('.home-match').first()).toContainText('PRACTICE');
  await page.getByRole('button', { name: 'Matches', exact: true }).click();
  await page.getByRole('tab', { name: 'Completed' }).click();
  await expect(page.locator('.match-list-card').first()).toContainText('Practice');
});

test('the creator deletes an unfinished match after confirming', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue offline', exact: true }).click();
  await quickMatch(page);
  // Offered before the first raid…
  await expect(page.getByRole('button', { name: 'Delete match', exact: true })).toBeVisible();
  await raid(page, 'A player 1', 'B player 1');
  // …hidden while the match is live…
  await expect(page.getByRole('button', { name: 'Delete match', exact: true })).toHaveCount(0);
  // …and offered again once it is paused.
  await page.getByRole('button', { name: 'Pause match', exact: true }).click();
  await page.getByRole('button', { name: 'Delete match', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Delete this match?' });
  await expect(sheet).toContainText('1 – 0');
  await expect(sheet).toContainText('3 recorded events are deleted from this phone.');
  await expect(sheet).toContainText('This can’t be undone.');
  await page.waitForTimeout(400);
  await page.screenshot({ path: '../.local/delete-match-sheet.png' });
  await sheet.getByRole('button', { name: 'Keep match' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.locator('.live-view-header .live-status')).toHaveText('PAUSED');
  await page.getByRole('button', { name: 'Delete match', exact: true }).click();
  await sheet.getByRole('button', { name: 'Delete match', exact: true }).click();
  await expect(page.getByRole('button', { name: '＋ Start a match' })).toBeVisible();
  await expect(page.locator('.home-match')).toHaveCount(0);
  await page.getByRole('button', { name: 'Matches', exact: true }).click();
  await expect(page.locator('.match-list-card')).toHaveCount(0);
  // It stays deleted after a reload.
  await page.reload();
  await page.getByRole('button', { name: 'Matches', exact: true }).click();
  await expect(page.locator('.match-list-card')).toHaveCount(0);
});

const liveView = {
  matchId: MATCH,
  version: 3,
  serverTime: Date.now(),
  lastSyncedAt: Date.now(),
  clockOffset: 0,
  events: [],
  state: {
    status: 'LIVE',
    phase: 'REGULATION',
    half: 1,
    raidNumber: 3,
    turn: 0,
    winner: null,
    currentRaiderId: null,
    scores: [2, 1],
    tieScores: [0, 0],
    clock: { remainingMs: 600000, startedAt: null },
    raidClock: { remainingMs: 30000, startedAt: null },
    teams: [0, 1].map((side) => ({
      name: side ? 'Uri Warriors' : 'Boniyar Bulls',
      players: Array.from({ length: 7 }, (_, i) => ({
        id: `${side}-${i}`,
        name: `P${side}${i}`,
        status: 'ACTIVE',
        raidPoints: 0,
        tacklePoints: 0,
      })),
    })),
  },
};

function mockApi(page: Page, extra: (path: string, route: Route) => unknown) {
  return page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = extra(path, route);
    if (json && typeof json === 'object' && 'status' in json && 'body' in json)
      return route.fulfill({ status: (json as { status: number }).status, json: (json as { body: unknown }).body });
    if (json === undefined) {
      json = [];
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
      if (path.endsWith('/account/notifications')) json = { unread: 0, items: [] };
      if (path.includes('/public/matches/')) json = liveView;
    }
    await route.fulfill({ json });
  });
}
async function signIn(page: Page) {
  await page.goto('/');
  await page.getByLabel('Mobile number').fill('9876543210');
  await page.getByRole('button', { name: 'Send code', exact: true }).click();
  await page.getByLabel('Verification code', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Profile' })).toBeVisible();
}

test('a signed-in watcher reports a match', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const reports: unknown[] = [];
  await mockApi(page, (path, route) => {
    if (path.endsWith(`/matches/${MATCH}/reports`)) {
      reports.push(route.request().postDataJSON());
      return { alreadyReported: false };
    }
    if (path.endsWith('/account/dashboard'))
      return { accountId: 'acc', phone: '+919876543210', playerProfile: null, tournamentCount: 0, teamCount: 0, ownedMatchCount: 0, recentMatches: [] };
  });
  await page.routeWebSocket(/\/ws\//, (ws) => ws.send(JSON.stringify({ type: 'view', view: liveView })));
  await signIn(page);
  await page.goto(`/watch/${MATCH}`);
  await page.getByRole('button', { name: '⚑ Report this match' }).click();
  const sheet = page.getByRole('dialog', { name: 'Report this match' });
  await expect(sheet.getByRole('button', { name: 'Send report' })).toBeDisabled();
  await sheet.getByText('This match didn’t happen').click();
  await sheet.getByLabel('Details (optional)').fill('These teams never played');
  await page.screenshot({ path: '../.local/report-sheet.png' });
  await sheet.getByRole('button', { name: 'Send report' }).click();
  await expect(sheet).toContainText('Thanks. RaidzOn will review this match.');
  expect(reports).toEqual([{ reason: 'FAKE_MATCH', details: 'These teams never played' }]);
});

test('a signed-out watcher is asked to sign in before reporting', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, () => undefined);
  await page.routeWebSocket(/\/ws\//, (ws) => ws.send(JSON.stringify({ type: 'view', view: liveView })));
  await page.goto(`/watch/${MATCH}`);
  await page.getByRole('button', { name: '⚑ Report this match' }).click();
  const sheet = page.getByRole('dialog', { name: 'Report this match' });
  await expect(sheet.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/?tab=profile');
});

test('an admin reviews reports and removes a fake match', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const reported = {
    id: MATCH,
    teamA: 'Boniyar Bulls',
    teamB: 'Uri Warriors',
    scoreA: 88,
    scoreB: 2,
    status: 'COMPLETED',
    practice: false,
    tournamentName: null,
    ownerPhone: '+919000000001',
    createdAt: Date.now(),
    removedAt: null,
    removedReason: null,
    openReports: 2,
    reasons: ['FAKE_MATCH', 'WRONG_SCORE'],
    details: ['These teams never played'],
    latestReportAt: Date.now(),
  };
  let removeBody: unknown = null;
  await mockApi(page, (path, route) => {
    if (path.endsWith('/account/dashboard'))
      return {
        accountId: 'acc',
        phone: '+919876543210',
        playerProfile: null,
        tournamentCount: 0,
        teamCount: 0,
        ownedMatchCount: 1,
        recentMatches: [
          { id: 'm1', teamA: 'A', teamB: 'B', status: 'COMPLETED', scoreA: 1, scoreB: 0, updatedAt: Date.now(), practice: true, removed: false },
        ],
        admin: true,
      };
    if (path.endsWith('/admin/reports')) return [reported];
    if (path.endsWith(`/admin/matches/${MATCH}/remove`)) {
      removeBody = route.request().postDataJSON();
      return { ...reported, openReports: 0, removedAt: Date.now(), removedReason: 'Fake match' };
    }
  });
  await signIn(page);
  await page.getByRole('button', { name: 'Profile' }).click();
  await page.getByText('My synced matches').click();
  await expect(page.locator('.profile-matches li').first()).toContainText('Practice, not counted in stats');
  await page.getByText('Admin · Match reports').click();
  const card = page.locator('.admin-report').first();
  await expect(card).toContainText('Boniyar Bulls 88–2 Uri Warriors');
  await expect(card).toContainText('2 reports');
  await expect(card).toContainText('This match didn’t happen · The score is wrong');
  await card.getByRole('button', { name: 'Remove…' }).click();
  await card.screenshot({ path: '../.local/admin-remove.png' });
  await card.getByRole('button', { name: 'Remove match' }).click();
  await expect(card).toContainText('Removed');
  await expect(card.getByRole('button', { name: 'Restore' })).toBeVisible();
  expect(removeBody).toEqual({ reason: 'Fake match' });
  await page.locator('.admin-reports').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '../.local/admin-reports.png' });
});

test('a signed-in creator also deletes the match from RaidzOn', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const deleted: string[] = [];
  let refuse = true;
  await mockApi(page, (path, route) => {
    if (path.endsWith('/delete')) {
      if (refuse) {
        refuse = false;
        return { status: 409, body: { code: 'MATCH_NOT_PAUSED', message: 'Pause the match before deleting it.' } };
      }
      deleted.push(path);
      return { deleted: true };
    }
    if (path.endsWith('/account/dashboard'))
      return { accountId: 'acc', phone: '+919876543210', playerProfile: null, tournamentCount: 0, teamCount: 0, ownedMatchCount: 0, recentMatches: [] };
  });
  await signIn(page);
  await quickMatch(page);
  // Close the share popup that opens for signed-in scorers.
  const share = page.getByRole('dialog', { name: 'Share the live scorecard' });
  await expect(share).toBeVisible();
  await share.getByRole('button', { name: 'Close' }).click();
  await expect(share).toBeHidden();
  await page.getByRole('button', { name: 'Delete match', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Delete this match?' });
  await sheet.getByRole('button', { name: 'Delete match', exact: true }).click();
  // The server's refusal is shown and nothing is deleted.
  await expect(sheet.getByRole('alert')).toHaveText('Pause the match before deleting it.');
  await sheet.getByRole('button', { name: 'Delete match', exact: true }).click();
  await expect(sheet).toBeHidden();
  expect(deleted).toHaveLength(1);
  expect(deleted[0]).toMatch(/\/api\/v1\/matches\/[0-9a-f-]{36}\/delete$/);
});
