import { test, expect, type Page, type Route } from '@playwright/test';

// Two phones of the same account. Phone A scores two raids but only the first reaches the server.
// Phone B takes the match over with a fresh code; phone A then finds it locked with its unsent raid listed.
// The server is mocked from phone A's own saved history. Screenshots go to HANDOVER_SHOTS when set.
const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const PHONE = '+919876543210';
const token = (letter: string) => letter.repeat(43);
const phoneSize = { width: 390, height: 844 };

async function shot(page: Page, name: string) {
  if (process.env.HANDOVER_SHOTS) await page.screenshot({ path: `${process.env.HANDOVER_SHOTS}/${name}.png`, fullPage: true });
}
/** Unmocked API calls answer 404 so nothing leaves the test. */
async function quietApi(page: Page) {
  await page.route('**/api/v1/**', (route: Route) => route.fulfill({ status: 404, json: { code: 'NOT_FOUND', message: 'Not mocked.' } }));
  await page.route('**/api/v1/auth/capabilities', (route) => route.fulfill({ json: { smsAvailable: true, widgetAvailable: false } }));
}
/** Reads or writes the app's IndexedDB directly. */
function idb<T>(page: Page, work: string, arg: unknown = null): Promise<T> {
  return page.evaluate(
    ([source, input]) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('raidzon');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const AsyncFunction = Object.getPrototypeOf(async () => undefined).constructor;
          Promise.resolve()
            .then(() => new AsyncFunction('db', 'input', source)(db, input))
            .then(resolve, reject)
            .finally(() => db.close());
        };
      }),
    [work, arg] as const,
  ) as Promise<T>;
}
const IDB_HELPERS = `
  const req = (r) => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  const store = (name, mode = 'readonly') => db.transaction(name, mode).objectStore(name);`;
async function signIn(page: Page, deviceKey = 'scorer-session') {
  await idb(page, `${IDB_HELPERS}
    const device = (await req(store('metadata').get(input.deviceKey)))?.value ?? crypto.randomUUID();
    const tx = db.transaction('metadata', 'readwrite').objectStore('metadata');
    await req(tx.put({ key: 'scorer-session', value: device }));
    await req(tx.put({ key: 'scoring-account', value: input.account }));
    await req(tx.put({ key: 'account-session', value: JSON.stringify({ token: input.token, accountId: input.account, deviceId: device, expiresAt: Date.now() + 3600000 }) }));
    return device;`, { deviceKey, account: ACCOUNT, token: token('s') });
}
async function scoreRaid(page: Page, raider: string, defender: string) {
  await page.getByRole('button', { name: `${raider} 0 raid pts`, exact: true }).click();
  await page.getByRole('button', { name: 'Successful', exact: true }).click();
  await page.getByRole('button', { name: `${defender} On court`, exact: true }).click();
  await page.getByRole('button', { name: 'Confirm raid →', exact: true }).click();
}

test('a signed-in owner moves a live match to a new phone; the old phone locks and lists its unsent raid', async ({ browser }) => {
  // Phone A: scores two raids offline-first.
  const phoneA = await browser.newContext({ viewport: phoneSize });
  const a = await phoneA.newPage();
  await quietApi(a);
  await a.goto('/');
  await a.getByRole('button', { name: 'Continue offline', exact: true }).click();
  await a.getByRole('button', { name: 'Start a match' }).click();
  const names = a.getByLabel('Team name', { exact: true });
  await names.nth(0).fill('Valley Raiders');
  await names.nth(1).fill('City Warriors');
  for (let side = 0; side < 2; side++)
    for (let player = 0; player < 7; player++) {
      await a.getByLabel(`Team ${side + 1} player ${player + 1} jersey number`, { exact: true }).fill(`${player + 1}`);
      await a.getByLabel(`Team ${side + 1} player ${player + 1} name`, { exact: true }).fill(`${side ? 'Warrior' : 'Raider'} ${player + 1}`);
    }
  await a.getByRole('button', { name: 'Start match →', exact: true }).click();
  await expect(a.getByText('Scorer mode', { exact: true })).toBeVisible();
  await scoreRaid(a, 'Raider 1', 'Warrior 1');
  await scoreRaid(a, 'Warrior 2', 'Raider 2');
  // The server got raid 1 only.
  const saved = await idb<{ match: Record<string, unknown> & { id: string; initialState: unknown }; events: { id: string; baseVersion: number; rulesetVersion: string; createdAt: string; intent: unknown; after: { scores: number[] } }[] }>(a, `${IDB_HELPERS}
    const match = (await req(store('matches').getAll()))[0];
    const events = (await req(store('events').getAll())).sort((x, y) => x.sequence - y.sequence);
    return { match, events };`);
  expect(saved.events).toHaveLength(2);
  const matchId = saved.match.id;
  await idb(a, `${IDB_HELPERS}
    const tx = db.transaction(['matches', 'events'], 'readwrite');
    const match = await req(tx.objectStore('matches').get(input.id));
    await req(tx.objectStore('matches').put({ ...match, localAccountId: input.account, serverAccountId: input.account, serverVersion: 1, syncError: '' }));
    for (const event of await req(tx.objectStore('events').getAll()))
      await req(tx.objectStore('events').put({ ...event, syncStatus: event.sequence === 1 ? 'SYNCED' : 'PENDING' }));`, { id: matchId, account: ACCOUNT });
  await signIn(a);

  // Phone B: same account, a different phone, nothing saved on it.
  const phoneB = await browser.newContext({ viewport: phoneSize });
  const b = await phoneB.newPage();
  await quietApi(b);
  const first = saved.events[0];
  const takeover = {
    matchId,
    rulesetVersion: saved.match.rulesetVersion,
    version: 1,
    setup: saved.match.initialState,
    state: first.after,
    events: [{ id: first.id, baseVersion: 0, rulesetVersion: first.rulesetVersion, occurredAt: Date.parse(first.createdAt), intent: first.intent }],
    practice: false,
    createdAt: Date.parse(String(saved.match.createdAt)),
    fixture: null,
  };
  const requests: Record<string, unknown>[] = [];
  await b.route('**/api/v1/account/dashboard', (route) => route.fulfill({ json: {
    accountId: ACCOUNT, phone: PHONE, playerProfile: null, tournamentCount: 0, teamCount: 0, ownedMatchCount: 1,
    recentMatches: [{ id: matchId, teamA: 'Valley Raiders', teamB: 'City Warriors', status: 'LIVE', scoreA: 1, scoreB: 0, updatedAt: Date.now(), practice: false, removed: false, scoringElsewhere: true }],
  } }));
  await b.route('**/api/v1/auth/challenges', (route) => route.fulfill({ json: { challengeId: 'challenge', expiresAt: Date.now() + 300000, resendAfterSeconds: 60 } }));
  await b.route('**/api/v1/auth/verify', (route) => {
    const input = route.request().postDataJSON();
    expect(input.code).toBe('123456');
    return route.fulfill({ json: { token: token('p'), accountId: ACCOUNT, deviceId: input.deviceId, expiresAt: Date.now() + 3600000 } });
  });
  await b.route('**/api/v1/auth/logout', (route) => route.fulfill({ json: { signedOut: true } }));
  await b.route(`**/api/v1/matches/${matchId}/takeover`, (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: takeover });
  });
  await b.goto('/');
  await b.evaluate(() => localStorage.setItem('raidzon.guest', '1'));
  await signIn(b);
  await b.reload();
  await b.getByRole('button', { name: 'Profile', exact: true }).click();
  const live = b.getByRole('region', { name: 'Live on another phone' });
  await expect(live).toContainText('Valley Raiders 1–0 City Warriors');
  await live.scrollIntoViewIfNeeded();
  await shot(b, '1-new-phone-profile');
  await live.getByRole('button', { name: 'Continue scoring here' }).click();
  const sheet = b.getByRole('dialog', { name: 'Continue scoring on this phone?' });
  await expect(sheet).toContainText('will not be added');
  await expect(sheet).toContainText(`we will send a code to ${PHONE}`);
  await shot(b, '2-new-phone-confirm');
  await sheet.getByRole('button', { name: 'Send code' }).click();
  await sheet.getByLabel(`Code sent to ${PHONE}`).fill('123456');
  await shot(b, '3-new-phone-code');
  await sheet.getByRole('button', { name: 'Confirm and continue here' }).click();
  await expect(b.getByText('Scorer mode', { exact: true })).toBeVisible();
  await expect(b.locator('.score-team strong').nth(0)).toHaveText('1');
  expect(requests).toEqual([{ verificationToken: token('p') }]);
  await shot(b, '4-new-phone-scoring');

  // Phone A reconnects: its pending raid is refused, the match locks and lists it.
  await a.route(`**/api/v1/matches/${matchId}/events`, (route) =>
    route.fulfill({ status: 403, json: { code: 'SCORING_MOVED', message: 'This match is now being scored on another phone.' } }));
  await a.reload();
  await a.locator('.home-resume').first().click();
  await expect(a.getByRole('heading', { name: 'This match moved to another phone' })).toBeVisible({ timeout: 20_000 });
  await expect(a.getByText('1 tap from this phone was not added')).toBeVisible();
  await expect(a.locator('.handover-taps li')).toHaveCount(1);
  await shot(a, '5-old-phone-locked');
  await phoneA.close();
  await phoneB.close();
});
