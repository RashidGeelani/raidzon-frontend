import { test, expect, type Page } from '@playwright/test';

async function openSetup(page: Page) {
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
}
const jersey = (page: Page, side: number, player: number) =>
  page.getByLabel(`Team ${side} player ${player} jersey number`, { exact: true });

test('every player needs a jersey number, unique within the team', async ({ page }) => {
  await openSetup(page);
  // Setup won't start with a number missing.
  await page.getByRole('button', { name: 'Start match →', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A match starts here.' })).toBeVisible();
  expect(await jersey(page, 1, 1).evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
  // Only digits, at most three.
  await jersey(page, 1, 1).fill('7a');
  await expect(jersey(page, 1, 1)).toHaveValue('7');
  await jersey(page, 1, 1).fill('1234');
  await expect(jersey(page, 1, 1)).toHaveValue('123');
  for (let side = 1; side <= 2; side++)
    for (let player = 1; player <= 7; player++) await jersey(page, side, player).fill(String(player * 10));
  await jersey(page, 1, 2).fill('10'); // same as player 1
  await page.getByRole('button', { name: 'Start match →', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Jersey 10 is used twice in Valley Raiders. Each player needs a different number.');
  await jersey(page, 1, 2).fill('999');
  await page.locator('.setup-teams .panel').first().screenshot({ path: '../.local/jersey-setup.png' });
  await page.getByRole('button', { name: 'Start match →', exact: true }).click();
  await expect(page.getByText('Scorer mode', { exact: true })).toBeVisible();
  // Numbers show in front of every name on the scoring screen.
  await expect(page.locator('.raid-panel .player-chip').first().locator('.jersey-badge')).toHaveText('10');
  await expect(page.locator('.raid-panel .player-chip').nth(1).locator('.jersey-badge')).toHaveText('999');
  await page.locator('.raid-panel').screenshot({ path: '../.local/jersey-chips.png' });
});

test('quick match fills blank jersey numbers without repeating typed ones', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue offline', exact: true }).click();
  await page.getByRole('button', { name: 'Start a match' }).click();
  await jersey(page, 1, 3).fill('2');
  await page.getByRole('button', { name: 'Quick match: fill blank names' }).click();
  const numbers = [];
  for (let player = 1; player <= 7; player++) numbers.push(await jersey(page, 1, player).inputValue());
  expect(numbers).toEqual(['1', '3', '2', '4', '5', '6', '7']);
  await expect(jersey(page, 2, 7)).toHaveValue('7');
});

test('the scorer picks raider, defenders and tackler by typing jersey numbers', async ({ page }) => {
  await openSetup(page);
  for (let side = 1; side <= 2; side++)
    for (let player = 1; player <= 7; player++) await jersey(page, side, player).fill(String(side * 10 + player));
  await page.getByRole('button', { name: 'Start match →', exact: true }).click();
  const pick = page.locator('form.jersey-pick');
  // Raider by number (Valley Raiders wear 11-17).
  await pick.getByLabel('Raider jersey number').fill('25');
  await pick.getByRole('button', { name: 'Start raid' }).click();
  await expect(pick.getByRole('status')).toHaveText('No Valley Raiders player who can raid wears #25.');
  await pick.getByLabel('Raider jersey number').fill('13');
  await pick.getByRole('button', { name: 'Start raid' }).click();
  await expect(page.getByText('#13 Raider 3 is raiding')).toBeVisible();
  // Defenders out by number (City Warriors wear 21-27).
  await pick.getByLabel('Defender jersey number').fill('22');
  await pick.getByRole('button', { name: 'Pick' }).click();
  await expect(pick.getByRole('status')).toHaveText('Choose what happened first, then type the defender’s number.');
  await page.getByRole('button', { name: 'Successful', exact: true }).click();
  for (const number of ['22', '24']) {
    await pick.getByLabel('Defender jersey number').fill(number);
    await pick.getByLabel('Defender jersey number').press('Enter');
  }
  await expect(page.locator('.player-chip.selected')).toHaveCount(2);
  await expect(page.locator('.player-chip.selected').first()).toContainText('Warrior 2');
  await page.screenshot({ path: '../.local/jersey-pick.png' });
  await page.getByRole('button', { name: 'Confirm raid →', exact: true }).click();
  await expect(page.locator('.scoreboard .score-team strong').first()).toHaveText('2');
  // Next raid: a City Warrior is tackled; the tackler is picked by number.
  await pick.getByLabel('Raider jersey number').fill('21');
  await pick.getByLabel('Raider jersey number').press('Enter');
  await page.getByRole('button', { name: 'Tackled', exact: true }).click();
  await pick.getByLabel('Tackler jersey number').fill('15');
  await pick.getByLabel('Tackler jersey number').press('Enter');
  await expect(page.getByRole('combobox', { name: 'Defender credited' })).toHaveValue(/.+/);
  await expect(page.getByRole('combobox', { name: 'Defender credited' }).locator('option:checked')).toHaveText('#15 Raider 5');
  await page.getByRole('button', { name: 'Confirm raid →', exact: true }).click();
  await expect(page.locator('.scoreboard .score-team strong').first()).toHaveText('3');
});
