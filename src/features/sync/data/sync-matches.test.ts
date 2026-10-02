import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  RaidzOnDatabase,
  createMatch,
  recordEvent,
  type SetupInput,
} from '../../matches/data/match-repository';
import { ApiError, deviceCredentials } from '../../identity/data/auth-client';
import { needsSync, syncMatch, type SyncTransport } from './sync-matches';
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
async function fixture(rulesetVersion: 'raidzon-v2' | 'raidzon-v3' | 'raidzon-v4' = 'raidzon-v3') {
  const device = await deviceCredentials(database);
  const account = {
    deviceId: device.deviceId,
    accountId: crypto.randomUUID(),
    token: 'test',
    expiresAt: Date.now() + 10000,
  };
  const match = await createMatch(setup(), device.deviceId, database);
  match.rulesetVersion = rulesetVersion;
  if (rulesetVersion !== 'raidzon-v4') {
    // Matches saved by earlier versions started the half clock at setup.
    const startedAt = Date.parse(match.createdAt);
    match.state.clock.startedAt = startedAt;
    if (match.initialState) match.initialState.clock.startedAt = startedAt;
  }
  match.localAccountId = account.accountId;
  await database.metadata.put({ key: 'scoring-account', value: account.accountId });
  await database.matches.put(match);
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
    claim: async (body) => {
      expect((body as { rulesetVersion: string }).rulesetVersion).toBe(rulesetVersion);
      return {
        matchId: match.id,
        rulesetVersion,
        version: serverVersion,
        state: serverVersion ? events[serverVersion - 1].after : match.state,
      };
    },
    append: async (_, body) => {
      const event = body as { id: string; baseVersion: number };
      expect((body as { rulesetVersion: string }).rulesetVersion).toBe(rulesetVersion);
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
it('does not upload an unreviewed guest match', async () => {
  const f = await fixture();
  await database.matches.update(f.match.id, { localAccountId: undefined });
  await expect(syncMatch(f.match.id, f.account, database, f.transport)).rejects.toThrow(
    'Review and claim',
  );
  expect(f.received).toEqual([]);
});
it.each(['raidzon-v2', 'raidzon-v3', 'raidzon-v4'] as const)(
  'uploads %s in order and safely retries an acknowledgement lost after server acceptance',
  async (ruleset) => {
    const f = await fixture(ruleset);
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
  },
);
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
  await expect(
    recordEvent(
      f.match.id,
      2,
      f.account.deviceId,
      { type: 'TECHNICAL', side: 0 },
      crypto.randomUUID(),
      database,
    ),
  ).rejects.toThrow('read-only');
  expect(await database.events.count()).toBe(2);
});
it('retries a prepared fixture link after match events are already synced', async () => {
  const f = await fixture();
  const tournamentId = crypto.randomUUID();
  const fixtureId = crypto.randomUUID();
  await database.matches.update(f.match.id, {
    fixtureRef: { tournamentId, fixtureId, linked: false },
  });
  let attempts = 0;
  f.transport.linkFixture = async (tournament, fixture, match) => {
    expect([tournament, fixture, match]).toEqual([tournamentId, fixtureId, f.match.id]);
    if (++attempts === 1) throw new Error('Connection lost while linking');
  };
  await expect(syncMatch(f.match.id, f.account, database, f.transport)).rejects.toThrow(
    'Connection lost',
  );
  const pending = (await database.matches.get(f.match.id))!;
  expect(pending.serverVersion).toBe(2);
  expect(needsSync(pending)).toBe(true);
  await syncMatch(f.match.id, f.account, database, f.transport);
  const linked = (await database.matches.get(f.match.id))!;
  expect(linked.fixtureRef?.linked).toBe(true);
  expect(needsSync(linked)).toBe(false);
  expect(attempts).toBe(2);
});
it('repairs a half-saved tap so the upload is not blocked by a gap', async () => {
  const f = await fixture();
  const stray = (sequence: number, id: string, after: MatchState) => ({ ...f.events[1], id, sequence, baseVersion: sequence - 1, after });
  // An event row whose match update never landed.
  await database.events.add(stray(3, 'orphan', f.events[1].after));
  await syncMatch(f.match.id, f.account, database, f.transport);
  expect(f.received).toEqual([f.events[0].id, f.events[1].id]);
  expect(await database.events.get('orphan')).toBeUndefined();
  expect(needsSync((await database.matches.get(f.match.id))!)).toBe(false);
});
it('sends events again when the server lost them (e.g. its database was reset)', async () => {
  const f = await fixture();
  await syncMatch(f.match.id, f.account, database, f.transport);
  let reset = true;
  const { claim, append } = f.transport;
  f.transport.claim = async (body) => (reset ? ((reset = false), { ...(await claim(body)), version: 0, state: f.match.state }) : claim(body));
  f.transport.append = async (id, body) => {
    if (reset) throw new ApiError(400, 'Match not found.');
    return append(id, body);
  };
  const next = await recordEvent(f.match.id, 2, f.account.deviceId, { type: 'TECHNICAL', side: 0 }, 'next', database);
  f.events.push((await database.events.get('next'))!);
  await syncMatch(f.match.id, f.account, database, f.transport);
  expect(f.received).toEqual([f.events[0].id, f.events[1].id, f.events[0].id, f.events[1].id, 'next']);
  expect(needsSync((await database.matches.get(next.id))!)).toBe(false);
});
it('sends a new tap in one request once the match is registered', async () => {
  const f = await fixture();
  await syncMatch(f.match.id, f.account, database, f.transport);
  let claims = 0;
  const { claim } = f.transport;
  f.transport.claim = async (body) => { claims++; return claim(body); };
  await recordEvent(f.match.id, 2, f.account.deviceId, { type: 'TECHNICAL', side: 1 }, 'tap', database);
  f.events.push((await database.events.get('tap'))!);
  await syncMatch(f.match.id, f.account, database, f.transport);
  expect(claims).toBe(0);
  expect(f.received.at(-1)).toBe('tap');
});
it('a later tap replaces a half-saved event instead of failing on it', async () => {
  const f = await fixture();
  await database.events.add({ ...f.events[1], id: 'orphan', sequence: 3, baseVersion: 2 });
  const next = await recordEvent(f.match.id, 2, f.account.deviceId, { type: 'TECHNICAL', side: 0 }, 'next', database);
  expect(next.version).toBe(3);
  expect(await database.events.get('orphan')).toBeUndefined();
  expect((await database.events.get('next'))?.sequence).toBe(3);
});
