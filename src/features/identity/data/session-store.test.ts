import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { db, createMatch, type SetupInput } from '../../matches/data/match-repository';
import { claimDeviceGuestMatches, claimGuestMatches } from './claim-guest-matches';
import { saveSession, restoreSession, clearSession, flushLogouts } from './session-store';
const session = {
  token: 'a'.repeat(43),
  accountId: 'account',
  deviceId: 'device',
  expiresAt: Date.now() + 60000,
};
afterEach(async () => {
  await db.metadata.clear();
  await db.matches.clear();
  await db.events.clear();
  vi.unstubAllGlobals();
});
async function guest() {
  const teams = [0, 1].map((side) => ({
    name: `Team ${side}`,
    players: Array.from({ length: 7 }, (_, i) => ({
      name: `Player ${side}${i}`,
      phone: `+9198765432${side}${i}`,
    })),
  })) as SetupInput['teams'];
  return createMatch({ teams, firstTurn: 0, halfMinutes: 20, raidSeconds: 30 }, session.deviceId);
}
it('the claim helper binds only selected guest matches to the current account', async () => {
  const first = await guest();
  const second = await guest();
  await saveSession(session);
  expect((await db.matches.get(first.id))?.localAccountId).toBeUndefined();
  await claimGuestMatches([first.id], session);
  expect((await db.matches.get(first.id))?.localAccountId).toBe(session.accountId);
  expect((await db.matches.get(second.id))?.localAccountId).toBeUndefined();
  const signedInMatch = await guest();
  expect(signedInMatch.localAccountId).toBe(session.accountId);
});
it('a stale mixed selection rolls back all claims', async () => {
  const first = await guest();
  const second = await guest();
  await saveSession(session);
  await db.matches.update(second.id, { localAccountId: 'another-account' });
  await expect(claimGuestMatches([first.id, second.id], session)).rejects.toThrow('changed');
  expect((await db.matches.get(first.id))?.localAccountId).toBeUndefined();
});
it('automatically claims only guest matches from the signed-in device', async () => {
  const eligible = await guest();
  const otherDevice = await guest();
  const otherAccount = await guest();
  await db.matches.update(otherDevice.id, { ownerSessionId: 'different-device' });
  await db.matches.update(otherAccount.id, { localAccountId: 'different-account' });
  await saveSession(session);
  expect(await claimDeviceGuestMatches(session)).toBe(1);
  expect((await db.matches.get(eligible.id))?.localAccountId).toBe(session.accountId);
  expect((await db.matches.get(otherDevice.id))?.localAccountId).toBeUndefined();
  expect((await db.matches.get(otherAccount.id))?.localAccountId).toBe('different-account');
  expect(await claimDeviceGuestMatches(session)).toBe(0);
});
it('claiming after logout or from another device is rejected', async () => {
  const match = await guest();
  await saveSession(session);
  await db.matches.update(match.id, { ownerSessionId: 'another-device' });
  await expect(claimGuestMatches([match.id], session)).rejects.toThrow('changed');
  await clearSession(session);
  await expect(claimGuestMatches([match.id], session)).rejects.toThrow('Sign in again');
});
it('restores an unexpired session and discards an expired session', async () => {
  await saveSession(session);
  expect(await restoreSession()).toEqual(session);
  await saveSession({ ...session, expiresAt: 1 });
  expect(await restoreSession()).toBeNull();
});
it('signs out locally offline and retries server revocation without losing it', async () => {
  await saveSession(session);
  await clearSession(session);
  expect(await restoreSession()).toBeNull();
  const fetch = vi.fn().mockRejectedValue(new Error('offline'));
  vi.stubGlobal('fetch', fetch);
  await expect(flushLogouts()).rejects.toThrow('offline');
  expect(await db.metadata.count()).toBe(1);
  fetch.mockResolvedValue(new Response(JSON.stringify({ signedOut: true }), { status: 200 }));
  await flushLogouts();
  expect(await db.metadata.count()).toBe(0);
  expect(fetch.mock.calls[1][1].headers.Authorization).toBe(`Bearer ${session.token}`);
});
