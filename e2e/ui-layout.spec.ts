import { test, expect } from '@playwright/test';

test('main screens fit small phones and desktop', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({ json: path.endsWith('/capabilities') ? { smsAvailable: true } : [] });
  });
  for (const width of [360, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    // The guest choice is remembered after the first pass.
    if (width === 360) await page.getByRole('button', { name: 'Continue offline', exact: true }).click();
    for (const name of ['Home', 'Matches', 'Tournaments', 'Teams', 'Profile']) {
      await page.getByRole('button', { name, exact: true }).last().click();
      await expect(page.locator('main')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${name} at ${width}`).toBeLessThanOrEqual(width);
      await page.screenshot({ path: `test-results/ui-${name.toLowerCase()}-${width}.png`, fullPage: true });
      if (name === 'Tournaments') {
        const field = await page.getByLabel('Search tournaments').boundingBox();
        const button = await page.getByRole('button', { name: 'Search', exact: true }).boundingBox();
        expect(Math.abs(field!.y - button!.y)).toBeLessThanOrEqual(2);
      }
    }
  }
});

test('sideline mode enlarges text, survives reload and keeps scoring inside a small phone', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({ json: path.endsWith('/capabilities') ? { smsAvailable: true } : [] });
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue offline', exact: true }).click();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await page.getByRole('switch', { name: /Sideline mode/ }).check();
  await expect(page.locator('html')).toHaveAttribute('data-sideline', 'on');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-sideline', 'on');
  await page.getByRole('button', { name: 'Score a new match' }).click();
  await page.getByRole('button', { name: /Quick match/ }).click();
  await page.getByRole('button', { name: 'Start match →', exact: true }).click();
  await page.getByRole('button', { name: 'A player 1 0 raid pts', exact: true }).click();
  const smallest = await page.evaluate(() =>
    Math.min(...[...document.querySelectorAll('.raid-panel small, .raid-panel .field-note, .score-meta span')]
      .map((element) => parseFloat(getComputedStyle(element).fontSize))),
  );
  expect(smallest).toBeGreaterThanOrEqual(14);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.screenshot({ path: 'test-results/sideline-scoring-360.png' });
  // The scoring header has its own switch to turn it off again.
  await page.getByRole('button', { name: /Sideline mode/ }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-sideline', 'on');
});
