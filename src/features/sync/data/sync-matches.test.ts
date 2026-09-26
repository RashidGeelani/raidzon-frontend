import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  RaidzOnDatabase,
  createMatch,
  recordEvent,
  type SetupInput,
} from '../../matches/data/match-repository';
import { deviceCredentials } from '../../identity/data/auth-client';
import { syncMatch, type SyncTransport } from './sync-matches';
import type { MatchState } from '../../scoring/domain/match-types';

let database: RaidzOnDatabase;
beforeEach(() => {
  database = new RaidzOnDatabase(`sync-${crypto.randomUUID()}`);
});
afterEach(async () => {
  await database.delete();
});
const setup = (): SetupInput => ({
  firstTurn: 0,
  halfMinutes: 20,
  raidSeconds: 30,
  teams: [0, 1].map((side) => ({
    name: `Team ${side}`,
    players: Array.from({ length: 7 }, (_, i) => ({
      name: `Player ${side}${i}`,
      phone: `+9198765432${side}${i}`,
    })),
  })) as SetupInput['teams'],
});
async function fixture() {
  const device = await deviceCredentials(database);
  const account = {
    deviceId: device.deviceId,
    accountId: crypto.randomUUID(),
    token: 'test',
    expiresAt: Date.now() + 10000,
  };
  const match = await createMatch(setup(), device.deviceId, database);
  await recordEvent(
    match.id,
    0,
    device.deviceId,
    { type: 'TECHNICAL', side: 0 },
    crypto.randomUUID(),
    database,
  );
  await recordEvent(
    match.id,
    1,
    device.deviceId,
    { type: 'TECHNICAL', side: 1 },
    crypto.randomUUID(),
    database,
  );
  const events = await database.events.where('matchId').equals(match.id).sortBy('sequence');
  let serverVersion = 0;
  const received: string[] = [];
  const transport: SyncTransport = {
    claim: async () => ({
      matchId: match.id,
      rulesetVersion: 'raidzon-v2',
      version: serverVersion,
      state: serverVersion ? events[serverVersion - 1].after : match.state,
    }),
    append: async (_, body) => {
      const event = body as { id: string; baseVersion: number };
      received.push(event.id);
      if (event.baseVersion > serverVersion) throw Error('gap');
      serverVersion = Math.max(serverVersion, event.baseVersion + 1);
      return {
        eventId: event.id,
        acceptedVersion: event.baseVersion + 1,
        currentVersion: serverVersion,
        state: events[serverVersion - 1].after,
      };
    },
  };
  return { account, match, events, transport, received };
}
it('keeps device credentials stable across reloads', async () => {
  const original = await deviceCredentials(database);
  database.close();
  await database.open();
  expect(await deviceCredentials(database)).toEqual(original);
  expect(original.deviceSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
});
it('uploads in order and safely retries an acknowledgement lost after server acceptance', async () => {
  const f = await fixture();
  const append = f.transport.append;
  let lose = true;
  f.transport.append = async (...args) => {
    const ack = await append(...args);
    if (lose) {
      lose = false;
      throw Error('connection lost');
    }
    return ack;
  };
  await expect(syncMatch(f.match.id, f.account, database, f.transport)).rejects.toThrow(
    'connection lost',
  );
  expect((await database.events.get(f.events[0].id))?.syncStatus).toBe('PENDING');
  database.close();
  await database.open();
  await syncMatch(f.match.id, f.account, database, f.transport);
  expect(f.received).toEqual([f.events[0].id, f.events[0].id, f.events[1].id]);
  expect((await database.events.toArray()).every((event) => event.syncStatus === 'SYNCED')).toBe(
    true,
  );
  expect((await database.matches.get(f.match.id))?.state).toEqual(f.events[1].after);
});
it('does not overwrite a new local event scored while an upload is in flight', async () => {
  const f = await fixture();
  const append = f.transport.append;
  let newEvent = false;
  f.transport.append = async (...args) => {
    if (!newEvent) {
      newEvent = true;
      await recordEvent(
        f.match.id,
        2,
        f.account.deviceId,
        { type: 'TECHNICAL', side: 0 },
        crypto.randomUUID(),
        database,
      );
    }
    return append(...args);
  };
  await syncMatch(f.match.id, f.account, database, f.transport);
  const saved = await database.matches.get(f.match.id);
  expect(saved?.version).toBe(3);
  expect(saved?.serverVersion).toBe(2);
  expect(saved?.state.scores).toEqual([2, 1]);
  expect(
    (await database.events.where('matchId').equals(f.match.id).sortBy('sequence'))[2].syncStatus,
  ).toBe('PENDING');
});
it('stops on a conflicting projection without acknowledging events or replacing local state', async () => {
  const f = await fixture();
  const original = f.transport.claim;
  f.transport.claim = async (body) => ({
    ...(await original(body)),
    state: { ...f.match.state, scores: [99, 99] } as MatchState,
  });
  await expect(syncMatch(f.match.id, f.account, database, f.transport)).rejects.toThrow(
    'history differ',
  );
  expect(f.received).toHaveLength(0);
  expect((await database.matches.get(f.match.id))?.state).toEqual(f.events[1].after);
  expect((await database.events.toArray()).every((event) => event.syncStatus === 'PENDING')).toBe(
    true,
  );
});
it('prevents another account or device from claiming an already owned local match', async () => {
  const f = await fixture();
  await database.matches.update(f.match.id, { serverAccountId: 'other' });
  await expect(syncMatch(f.match.id, f.account, database, f.transport)).rejects.toThrow(
    'account that already owns',
  );
  await expect(
    syncMatch(f.match.id, { ...f.account, deviceId: 'other' }, database, f.transport),
  ).rejects.toThrow('original scoring device');
  expect(f.received).toHaveLength(0);
});
it('reconstructs the original setup for existing v2 saves without an initial snapshot', async () => {
  const f = await fixture();
  const saved = (await database.matches.get(f.match.id))!;
  delete saved.initialState;
  await database.matches.put(saved);
  await syncMatch(f.match.id, f.account, database, f.transport);
  expect((await database.matches.get(f.match.id))?.serverVersion).toBe(2);
});
it('rejects an acknowledgement for a different event', async () => {
  const f = await fixture();
  const append = f.transport.append;
  f.transport.append = async (...args) => ({ ...(await append(...args)), eventId: 'wrong' });
  await expect(syncMatch(f.match.id, f.account, database, f.transport)).rejects.toThrow(
    'Unexpected server event',
  );
  expect((await database.events.get(f.events[0].id))?.syncStatus).toBe('PENDING');
});
it('refuses history gaps before issuing a network write', async () => {
  const f = await fixture();
  await database.events.delete(f.events[0].id);
  await expect(syncMatch(f.match.id, f.account, database, f.transport)).rejects.toThrow('gap');
  expect(f.received).toHaveLength(0);
});
it('does not let another account claim a match that has never reached the server', async () => {
  const f = await fixture();
  await database.matches.update(f.match.id, { localAccountId: 'original-account' });
  await expect(syncMatch(f.match.id, f.account, database, f.transport)).rejects.toThrow(
    'account that created',
  );
  expect(f.received).toHaveLength(0);
});
it('blocks local scoring after delegation without modifying history', async () => {
  const f = await fixture();
  await database.matches.update(f.match.id, { scoringDelegated: true });
  await expect(recordEvent(f.match.id, 2, f.account.deviceId, { type: 'TECHNICAL', side: 0 }, crypto.randomUUID(), database)).rejects.toThrow('read-only');
  expect(await database.events.count()).toBe(2);
});
