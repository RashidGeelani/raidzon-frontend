import { test, expect } from '@playwright/test';

test('organizer creates tournament, registers teams and schedules a fixture', async ({
  page,
  context,
}) => {
  let tournament: any = null;
  const teams: any[] = [];
  const fixtures: any[] = [];
  await page.route('**/api/v1/auth/capabilities', (route) =>
    route.fulfill({ json: { smsAvailable: true } }),
  );
  await page.route('**/api/v1/auth/challenges', (route) =>
    route.fulfill({
      json: { challengeId: 'otp', expiresAt: Date.now() + 300000, resendAfterSeconds: 60 },
    }),
  );
  await page.route('**/api/v1/auth/verify', (route) =>
    route.fulfill({
      json: {
        token: 'a'.repeat(43),
        accountId: 'organizer',
        deviceId: route.request().postDataJSON().deviceId,
        expiresAt: Date.now() + 43200000,
      },
    }),
  );
  await page.route('**/api/v1/account/assignments', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/account/dashboard', (route) =>
    route.fulfill({
      json: {
        accountId: 'organizer',
        phone: '+919876543210',
        playerProfile: null,
        ownedMatchCount: 0,
        recentMatches: [],
      },
    }),
  );
  await page.route('**/api/v1/tournaments**', (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${'a'.repeat(43)}`);
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      if (path.endsWith('/schedule')) {
        const fixture = fixtures.find((item) => item.id === path.split('/').at(-2));
        if (fixture.scheduledAt !== body.scheduledAt) {
          fixture.scheduledAt = body.scheduledAt;
          fixture.scheduleRevision++;
        }
      } else if (path.endsWith('/roster')) {
        const team = teams.find((item) => item.id === path.split('/').at(-2));
        team.roster = body.players;
        team.rosterRevision++;
      } else if (path.endsWith('/teams'))
        teams.push({ ...body, id: body.id, roster: [], rosterRevision: 0 });
      else if (path.endsWith('/fixtures'))
        fixtures.push({ ...body, matchId: null, scheduleRevision: 0 });
      else tournament = body;
      return route.fulfill({ json: { tournament, teams, fixtures } });
    }
    return route.fulfill({
      json: path.endsWith('/tournaments')
        ? tournament
          ? [tournament]
          : []
        : { tournament, teams, fixtures },
    });
  });
  await page.goto('/');
  await page.getByLabel('Mobile number').fill('9876543210');
  await page.getByRole('button', { name: 'Send code', exact: true }).click();
  await page.getByLabel('Verification code', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Tournaments', exact: true }).click();
  const panel = page.getByRole('region', { name: 'My tournaments' });
  await panel.locator('summary').click();
  await panel.getByLabel('Tournament name').fill('District Cup');
  await panel.getByLabel('Venue').fill('Main court');
  await panel.getByLabel('Start date').fill('2026-10-10');
  await panel.getByRole('button', { name: 'Create tournament', exact: true }).click();
  await expect(panel.getByRole('heading', { name: 'District Cup' })).toBeVisible();
  await panel.getByLabel('Team name', { exact: true }).fill('Raiders');
  await panel.getByRole('button', { name: 'Register team' }).click();
  await expect(panel.locator('li').filter({ hasText: 'Raiders' })).toBeVisible();
  await panel.getByLabel('Team name', { exact: true }).fill('Defenders');
  await panel.getByRole('button', { name: 'Register team' }).click();
  await expect(
    panel.getByRole('heading', { name: 'Registered teams (2)', exact: true }),
  ).toBeVisible();
  await panel.getByText('Raiders roster (0 saved)').click();
  for (let index = 1; index <= 7; index++) {
    await panel.getByLabel(`Raiders player ${index} name`).fill(`Raider ${index}`);
    await panel
      .getByLabel(`Raiders player ${index} phone`)
      .fill(`98765430${String(index).padStart(2, '0')}`);
  }
  await panel.getByRole('button', { name: 'Save roster' }).first().click();
  await expect(panel.getByText('Raiders roster (7 saved)')).toBeVisible();
  await panel
    .getByRole('combobox', { name: 'Team A', exact: true })
    .selectOption({ label: 'Raiders' });
  await panel
    .getByRole('combobox', { name: 'Team B', exact: true })
    .selectOption({ label: 'Defenders' });
  await panel.getByRole('button', { name: 'Add fixture' }).click();
  await expect(panel.getByText('Raiders vs Defenders', { exact: true })).toBeVisible();
  expect(tournament.halfMinutes).toBe(20);
  expect(tournament.raidSeconds).toBe(30);
  await page.reload();
  await page.getByRole('button', { name: 'Tournaments', exact: true }).click();
  await panel
    .getByRole('combobox', { name: 'Choose tournament', exact: true })
    .selectOption({ label: 'District Cup · 2026-10-10' });
  await expect(panel.getByText('Raiders vs Defenders', { exact: true })).toBeVisible();
  await panel.getByLabel('Fixture time (local)').fill('2026-10-11T10:00');
  await panel.getByRole('button', { name: 'Save fixture time' }).click();
  await expect(panel.getByRole('status')).toHaveText('Saved.');
  expect(fixtures[0].scheduleRevision).toBe(1);
  expect(fixtures[0].scheduledAt).toBeTruthy();
  await context.setOffline(true);
  await expect(panel.getByRole('button', { name: 'Add fixture' })).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'Save fixture time' })).toBeDisabled();
  await panel.getByRole('button', { name: 'Prepare match' }).click();
  await expect(page.getByRole('heading', { name: 'A match starts here.' })).toBeVisible();
  await expect(page.locator('.setup-teams').getByLabel('Team name').first()).toHaveValue('Raiders');
  await expect(page.locator('.setup-teams').getByLabel('Team name').last()).toHaveValue(
    'Defenders',
  );
  await expect(page.getByLabel('Team 1 player 1 name')).toHaveValue('Raider 1');
});
