import { test, expect } from '@playwright/test';

test('main screens fit small phones and desktop', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({ json: path.endsWith('/capabilities') ? { smsAvailable: true } : [] });
  });
  for (const width of [360, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    for (const name of ['Home', 'Tournaments', 'Matches', 'Leaderboards', 'Profile']) {
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
