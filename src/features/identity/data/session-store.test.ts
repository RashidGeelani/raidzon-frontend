import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { db } from '../../matches/data/match-repository';
import { saveSession, restoreSession, clearSession, flushLogouts } from './session-store';
const session = {
  token: 'a'.repeat(43),
  accountId: 'account',
  deviceId: 'device',
  expiresAt: Date.now() + 60000,
};
afterEach(async () => {
  await db.metadata.clear();
  vi.unstubAllGlobals();
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
