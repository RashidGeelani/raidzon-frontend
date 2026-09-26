import { test, expect } from '@playwright/test';
test('public scorecard updates without login and removes data when unpublished', async ({
  page,
}) => {
  let score = 2,
    published = true;
  await page.route('**/api/v1/public/scorecards/*', (route) =>
    route.fulfill(
      published
        ? {
            json: {
              shareId: '11111111-1111-4111-8111-111111111111',
              teamA: 'Raiders',
              teamB: 'Defenders',
              scoreA: score,
              scoreB: 1,
              tieScoreA: 0,
              tieScoreB: 0,
              status: 'LIVE',
              phase: 'REGULATION',
              half: 1,
              raidNumber: 3,
              winner: null,
              version: score,
              lastSyncedAt: Date.now(),
            },
          }
        : { status: 404, json: { message: 'Unavailable' } },
    ),
  );
  await page.goto('/scorecard/11111111-1111-4111-8111-111111111111');
  await expect(page.getByText('2 – 1', { exact: true })).toBeVisible();
  await expect(page.getByText('Raiders', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send code' })).toHaveCount(0);
  score = 4;
  await expect(page.getByText('4 – 1', { exact: true })).toBeVisible({ timeout: 10000 });
  published = false;
  await expect(page.getByRole('status')).toHaveText(
    'This scorecard is unavailable or no longer shared.',
    { timeout: 10000 },
  );
  await expect(page.getByText('Raiders', { exact: true })).toHaveCount(0);
});
