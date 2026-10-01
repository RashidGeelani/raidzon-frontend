import { test, expect, type Page } from '@playwright/test';

async function fillMatch(page: Page) {
  await page.getByRole('button', { name: 'Start a match' }).click();
  const names = page.getByLabel('Team name', { exact: true });
  await names.nth(0).fill('Valley Raiders');
  await names.nth(1).fill('City Warriors');
  for (let side = 0; side < 2; side++) {
    for (let player = 0; player < 7; player++) {
      await page
        .getByLabel(`Team ${side + 1} player ${player + 1} name`, { exact: true })
        .fill(`${side ? 'Warrior' : 'Raider'} ${player + 1}`);
      await page
        .getByLabel(`Team ${side + 1} player ${player + 1} phone`, { exact: true })
        .fill(`98765432${side}${player}`);
    }
  }
  await page.getByRole('button', { name: 'Start match →', exact: true }).click();
  await expect(page.getByText('Scorer mode', { exact: true })).toBeVisible();
}

test('guest creates, scores, reloads, undoes and completes a match entirely offline', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Prompt-mode workers take control on navigation instead of forcing a live reload.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.screenshot({ path: '../.local/home-desktop.png', fullPage: true });
  await context.setOffline(true);
  await fillMatch(page);
  await page.getByRole('button', { name: 'Raider 1 0 raid pts', exact: true }).click();
  await page.getByRole('button', { name: 'Start raid →', exact: true }).click();
  await page.getByRole('button', { name: 'Successful', exact: true }).click();
  await page.getByRole('button', { name: 'Warrior 1 On court', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm raid →', exact: true }).click();
  await expect(page.getByText('Raider 1: touch', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ready for the next raid?' })).toBeVisible();
  await page.getByRole('button', { name: /Resume match/ }).click();
  await expect(page.getByText('Raider 1: touch', { exact: true })).toBeVisible();
  await expect(page.locator('.score-team strong').nth(0)).toHaveText('1');
  await page.screenshot({ path: '../.local/live-desktop.png', fullPage: true });
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Undo last event' }).click();
  await expect(page.locator('.score-team strong').nth(0)).toHaveText('0');
  await expect(page.getByRole('heading', { name: 'Raider 1 is raiding' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm raid →', exact: true }).click();
  await page.getByRole('button', { name: 'End first half', exact: true }).click();
  await page.getByRole('button', { name: 'Start second half →', exact: true }).click();
  await page.getByRole('button', { name: 'End regulation', exact: true }).click();
  await page.getByRole('button', { name: 'Accept draw', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Match drawn', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /View result/ }).click();
  await expect(page.getByRole('heading', { name: 'Match drawn', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('mobile setup and scoring remain inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.screenshot({ path: '../.local/home-mobile.png', fullPage: true });
  await fillMatch(page);
  await page.screenshot({ path: '../.local/live-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.getByRole('button', { name: 'Undo last event' })).toBeVisible();
});

test('mobile tie-break selects five ordered raiders and awards empty-raid OUT', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await fillMatch(page);
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'End first half', exact: true }).click();
  await page.getByRole('button', { name: 'Start second half →', exact: true }).click();
  await page.getByRole('button', { name: 'End regulation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Decide winner →', exact: true })).toBeDisabled();
  for (const [team, player] of [
    ['Valley Raiders', 'Raider'],
    ['City Warriors', 'Warrior'],
  ]) {
    for (let i = 1; i <= 5; i++)
      await page
        .getByLabel(`${team} raid ${i}`, { exact: true })
        .selectOption({ label: `${player} ${i}` });
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Decide winner →', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Raider 2 0 raid pts', exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Raider 1 0 raid pts', exact: true }).click();
  await page.getByRole('button', { name: 'Start raid →', exact: true }).click();
  await expect(page.getByText(/No scoring point: raider OUT/)).toBeVisible();
  await page.getByRole('button', { name: 'Confirm raid →', exact: true }).click();
  await expect(page.locator('.score-team strong').nth(1)).toHaveText('1');
  await page.getByRole('button', { name: 'Warrior 1 0 raid pts', exact: true }).click();
  await page.getByRole('button', { name: 'Start raid →', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: /Bonus/ })).toBeEnabled();
  await page.getByRole('checkbox', { name: /Bonus/ }).check();
  await page.getByRole('button', { name: 'Confirm raid →', exact: true }).click();
  await expect(page.locator('.score-team strong').nth(1)).toHaveText('2');
  await expect(
    page.getByRole('button', { name: 'Raider 2 0 raid pts', exact: true }),
  ).toBeVisible();
});
