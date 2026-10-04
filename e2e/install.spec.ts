import { test, expect } from '@playwright/test';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const WHATSAPP =
  'Mozilla/5.0 (Linux; Android 14; SM-A146B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0 Mobile Safari/537.36 WhatsApp/2.24.19';

test('Chrome install prompt opens from the Profile card', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { prompted: number }).prompted = 0;
    setTimeout(() => {
      const event = Object.assign(new Event('beforeinstallprompt'), {
        prompt: async () => {
          (window as unknown as { prompted: number }).prompted++;
        },
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      });
      window.dispatchEvent(event);
    }, 200);
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue offline', exact: true }).click();
  await page.getByRole('button', { name: 'Profile' }).click();
  await page.getByRole('button', { name: 'Install', exact: true }).click();
  await expect(page.getByText('raidzOn is on your home screen.')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { prompted: number }).prompted)).toBe(1);
});

test('iPhone Safari gets the Add to Home Screen guide', async ({ browser }) => {
  const context = await browser.newContext({
    userAgent: IPHONE,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue offline', exact: true }).click();
  await page.getByRole('button', { name: 'Profile' }).click();
  await page.getByRole('button', { name: 'Show me how' }).click();
  await expect(page.getByRole('dialog', { name: 'Add raidzOn to your Home Screen' })).toBeVisible();
  await context.close();
});

test('WhatsApp browser offers to open the page in Chrome', async ({ browser }) => {
  const context = await browser.newContext({
    userAgent: WHATSAPP,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto('/help');
  await expect(page.getByText('Open in Chrome for the full app')).toBeVisible();
  await expect(page.locator('.inapp-banner a')).toHaveAttribute(
    'href',
    /^intent:\/\/127\.0\.0\.1:\d+\/help#Intent;scheme=http;package=com\.android\.chrome;/,
  );
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.locator('.inapp-banner')).toHaveCount(0);
  await context.close();
});

test('home-screen shortcut opens match setup', async ({ page }) => {
  await page.goto('/?action=score');
  await page.getByRole('button', { name: 'Continue offline', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start match →', exact: true })).toBeVisible();
  expect(new URL(page.url()).search).toBe('');
});
