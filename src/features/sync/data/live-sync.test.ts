import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccountSession } from '../../identity/data/auth-client';
import { RaidzOnDatabase, createMatch } from '../../matches/data/match-repository';
import { describeFailure, liveSyncState, pushNow, resetLiveSync } from './live-sync';

const account: AccountSession = { token: 't'.repeat(43), accountId: 'acc', deviceId: 'dev', expiresAt: Date.now() + 60_000 };
let database: RaidzOnDatabase;
async function match(signedIn = true) {
  if (signedIn) await database.metadata.put({ key: 'scoring-account', value: account.accountId });
  const teams = [0, 1].map((side) => ({ name: `T${side}`, players: Array.from({ length: 7 }, (_, i) => ({ name: `P${side}${i}`, phone: `+9198765432${side}${i}` })) }));
  return createMatch({ teams: teams as never, firstTurn: 0, halfMinutes: 20, raidSeconds: 30 }, account.deviceId, database);
}
beforeEach(() => { database = new RaidzOnDatabase(`live-${crypto.randomUUID()}`); resetLiveSync(); });
afterEach(async () => { vi.useRealTimers(); resetLiveSync(); await database.delete(); });

describe('online scoring queue', () => {
  it('keeps guest matches on the phone', async () => {
    const created = await match(false);
    const sync = vi.fn();
    await pushNow(created.id, { database, session: account, online: true, sync });
    expect(sync).not.toHaveBeenCalled();
    expect(liveSyncState(created.id)?.status).toBe('local');
  });
  it('waits for a connection when offline', async () => {
    const created = await match();
    const sync = vi.fn();
    await pushNow(created.id, { database, session: account, online: false, sync });
    expect(sync).not.toHaveBeenCalled();
    expect(liveSyncState(created.id)?.status).toBe('offline');
  });
  it('uploads immediately and reports live', async () => {
    const created = await match();
    const sync = vi.fn(async () => { await database.matches.update(created.id, { serverAccountId: account.accountId, serverVersion: 0 }); });
    await pushNow(created.id, { database, session: account, online: true, sync });
    expect(sync).toHaveBeenCalledTimes(1);
    expect(liveSyncState(created.id)?.status).toBe('synced');
  });
  it('coalesces taps made during an upload into one follow-up upload', async () => {
    const created = await match();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let calls = 0;
    const sync = vi.fn(async () => {
      calls++;
      if (calls === 1) await gate;
      if (calls === 2) await database.matches.update(created.id, { serverAccountId: account.accountId, serverVersion: 0 });
    });
    const first = pushNow(created.id, { database, session: account, online: true, sync });
    await vi.waitFor(() => expect(sync).toHaveBeenCalledTimes(1));
    const taps = [1, 2, 3].map(() => pushNow(created.id, { database, session: account, online: true, sync }));
    release();
    await Promise.all([first, ...taps]);
    expect(sync).toHaveBeenCalledTimes(2);
    expect(liveSyncState(created.id)?.status).toBe('synced');
  });
  it('retries a sleeping server instead of failing the match', async () => {
    const created = await match();
    // Only fake setTimeout: the in-memory IndexedDB relies on real setImmediate.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let calls = 0;
    const sync = vi.fn(async () => {
      if (++calls === 1) throw new DOMException('timed out', 'TimeoutError');
      await database.matches.update(created.id, { serverAccountId: account.accountId, serverVersion: 0 });
    });
    await pushNow(created.id, { database, session: account, online: true, sync });
    expect(liveSyncState(created.id)).toMatchObject({ status: 'retrying' });
    expect(liveSyncState(created.id)?.message).toMatch(/waking up/);
    await vi.advanceTimersByTimeAsync(1100);
    await vi.waitFor(() => expect(liveSyncState(created.id)?.status).toBe('synced'));
    expect(sync).toHaveBeenCalledTimes(2);
  });
  it('does not retry problems a retry cannot fix', () => {
    expect(describeFailure(new ApiError(401, 'x')).retry).toBe(false);
    expect(describeFailure(new ApiError(409, 'Server and device history differ.')).retry).toBe(false);
    expect(describeFailure(new ApiError(503, 'down')).retry).toBe(true);
    expect(describeFailure(new TypeError('Failed to fetch')).retry).toBe(true);
  });
});

describe('upload queue errors', () => {
  it('a failed queued upload never becomes an unhandled rejection', async () => {
    const { runSerialized } = await import('./live-sync');
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    await expect(runSerialized('m', async () => { throw new TypeError('Failed to fetch'); })).rejects.toThrow('Failed to fetch');
    await runSerialized('m', async () => undefined);
    await new Promise((resolve) => setTimeout(resolve, 20));
    process.off('unhandledRejection', onUnhandled);
    expect(unhandled).toEqual([]);
  });
});
