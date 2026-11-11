import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { RaidzOnDatabase, createMatch, recordEvent, type SetupInput } from '../../matches/data/match-repository';
import { ApiError, deviceCredentials } from '../../identity/data/auth-client';
import type { LocalMatch, MatchState } from '../../scoring/domain/match-types';
import { MISMATCH, continueScoringHere, rebuildTakeover, unsentTaps, type TakeoverResponse } from './takeover';
import { needsSync, syncMatch, type SyncTransport } from './sync-matches';
import { MatchMovedAway } from '../MatchHandover';

let database: RaidzOnDatabase;
beforeEach(() => {
  database = new RaidzOnDatabase(`takeover-${crypto.randomUUID()}`);
});
afterEach(async () => {
  await database.delete();
});
const setup = (): SetupInput => ({
  firstTurn: 0,
  halfMinutes: 20,
  teams: [0, 1].map((side) => ({
    name: `Team ${side}`,
    players: Array.from({ length: 7 }, (_, i) => ({ name: `Player ${side}${i}`, phone: '', jersey: String(i + 1) })),
  })) as SetupInput['teams'],
});

/** Phone A scores a few taps; returns what the server would send phone B, built from A's real history. */
async function scoredOnPhoneA(taps = 3) {
  const device = await deviceCredentials(database);
  const accountId = crypto.randomUUID();
  await database.metadata.put({ key: 'scoring-account', value: accountId });
  const created = await createMatch(setup(), device.deviceId, database);
  await database.matches.update(created.id, { localAccountId: accountId });
  for (let version = 0; version < taps; version++)
    await recordEvent(created.id, version, device.deviceId, { type: 'TECHNICAL', side: version % 2 === 0 ? 0 : 1 }, crypto.randomUUID(), database);
  const match = (await database.matches.get(created.id))!;
  const events = await database.events.where('matchId').equals(created.id).sortBy('sequence');
  const response: TakeoverResponse = {
    matchId: match.id,
    rulesetVersion: match.rulesetVersion!,
    version: match.version,
    setup: structuredClone(match.initialState!),
    state: structuredClone(match.state),
    events: events.map((event) => ({
      id: event.id,
      baseVersion: event.baseVersion,
      rulesetVersion: event.rulesetVersion,
      occurredAt: Date.parse(event.createdAt),
      intent: event.intent,
    })),
    practice: false,
    createdAt: Date.parse(match.createdAt),
    fixture: null,
  };
  return { match, events, response, accountId, phoneA: device.deviceId };
}
const phoneB = (accountId: string) => ({ accountId, deviceId: crypto.randomUUID(), token: 'b', expiresAt: Date.now() + 60_000 });

it('rebuilds every raid on the new phone and lands on the server score', async () => {
  const { match, events, response, accountId } = await scoredOnPhoneA();
  const account = phoneB(accountId);
  const rebuilt = rebuildTakeover(response, account);
  expect(rebuilt.match.state).toEqual(match.state);
  expect(rebuilt.match.version).toBe(3);
  expect(rebuilt.match).toMatchObject({ ownerSessionId: account.deviceId, serverAccountId: accountId, serverVersion: 3, takenOver: true });
  expect(rebuilt.events.map((event) => event.after)).toEqual(events.map((event) => event.after));
  expect(rebuilt.events.every((event) => event.syncStatus === 'SYNCED' && event.scorerSessionId === account.deviceId)).toBe(true);
  expect(needsSync(rebuilt.match)).toBe(false);
});

it('refuses a history that does not rebuild to the server score', async () => {
  const { response, accountId } = await scoredOnPhoneA();
  const wrongScore: MatchState = structuredClone(response.state);
  wrongScore.scores = [9, 9];
  expect(() => rebuildTakeover({ ...response, state: wrongScore }, phoneB(accountId))).toThrow(MISMATCH);
  expect(() => rebuildTakeover({ ...response, version: 4 }, phoneB(accountId))).toThrow(MISMATCH);
  expect(() => rebuildTakeover({ ...response, events: response.events.slice(1) }, phoneB(accountId))).toThrow(MISMATCH);
  expect(() => rebuildTakeover({ ...response, rulesetVersion: 'raidzon-v1' }, phoneB(accountId))).toThrow(/Update the app/);
});

it('saves the match only after checking it, replacing this phone’s old copy in one go', async () => {
  const { match, response, accountId } = await scoredOnPhoneA();
  const account = phoneB(accountId);
  // This phone had an older copy with one tap the server never got.
  await database.events.where('matchId').equals(match.id).modify({ syncStatus: 'PENDING' });
  const bodies: unknown[] = [];
  const saved = await continueScoringHere(match.id, account, 'proof', database, async (body) => {
    bodies.push(body);
    return response;
  });
  expect(bodies).toEqual([{ verificationToken: 'proof' }]);
  expect(saved.takenOver).toBe(true);
  expect((await database.matches.get(match.id))!.ownerSessionId).toBe(account.deviceId);
  expect(await unsentTaps(match.id, database)).toEqual([]);
  // A bad answer leaves whatever was on the phone untouched.
  const before = await database.matches.get(match.id);
  await expect(
    continueScoringHere(match.id, account, undefined, database, async () => ({ ...response, version: 9 })),
  ).rejects.toThrow(MISMATCH);
  expect(await database.matches.get(match.id)).toEqual(before);
  // Scoring carries on from the rebuilt match.
  await database.metadata.put({ key: 'scoring-account', value: accountId });
  const next = await recordEvent(match.id, 3, account.deviceId, { type: 'TECHNICAL', side: 0 }, crypto.randomUUID(), database);
  expect(next.version).toBe(4);
});

it('a taken-over match checks in with the server instead of registering again', async () => {
  const { match, response, accountId } = await scoredOnPhoneA();
  const account = phoneB(accountId);
  await continueScoringHere(match.id, account, 'proof', database, async () => response);
  await database.metadata.put({ key: 'scoring-account', value: accountId });
  await recordEvent(match.id, 3, account.deviceId, { type: 'TECHNICAL', side: 0 }, crypto.randomUUID(), database);
  await database.matches.update(match.id, { syncError: 'Connection problem.' }); // forces the full check
  const calls: string[] = [];
  const transport: SyncTransport = {
    claim: async () => {
      calls.push('claim');
      throw new Error('must not register a taken-over match');
    },
    resume: async () => {
      calls.push('resume');
      return { matchId: match.id, rulesetVersion: response.rulesetVersion, version: 3, state: response.state };
    },
    append: async (_id, body) => {
      calls.push('append');
      const saved = (await database.events.get((body as { id: string }).id))!;
      return { eventId: saved.id, acceptedVersion: 4, currentVersion: 4, state: saved.after };
    },
  };
  await syncMatch(match.id, account, database, transport);
  expect(calls).toEqual(['resume', 'append']);
  expect((await database.matches.get(match.id))!.serverVersion).toBe(4);
});

it('the old phone locks the match when the server says it moved, and keeps its unsent taps', async () => {
  const { match, accountId, phoneA } = await scoredOnPhoneA(2);
  const account = { accountId, deviceId: phoneA, token: 'a', expiresAt: Date.now() + 60_000 };
  await database.matches.update(match.id, { serverAccountId: accountId, serverVersion: 1 });
  await database.events.where({ matchId: match.id }).modify((event) => {
    event.syncStatus = event.sequence === 1 ? 'SYNCED' : 'PENDING';
  });
  let claims = 0;
  const transport: SyncTransport = {
    claim: async () => {
      claims++;
      return { matchId: match.id, rulesetVersion: match.rulesetVersion!, version: 1, state: (await database.events.where({ matchId: match.id }).first())!.after };
    },
    append: async () => {
      throw new ApiError(403, 'This match is now being scored on another phone.', 'SCORING_MOVED');
    },
  };
  await expect(syncMatch(match.id, account, database, transport)).rejects.toThrow('another phone');
  expect(claims).toBeLessThanOrEqual(1); // no second full retry
  const locked = (await database.matches.get(match.id))!;
  expect(locked.movedAway).toBe(true);
  expect(needsSync(locked)).toBe(false);
  const taps = await unsentTaps(match.id, database);
  expect(taps).toHaveLength(1);
  await expect(
    recordEvent(match.id, 2, phoneA, { type: 'TECHNICAL', side: 0 }, crypto.randomUUID(), database),
  ).rejects.toThrow('another phone');

  const events = await database.events.where('matchId').equals(match.id).sortBy('sequence');
  const markup = renderToStaticMarkup(
    createElement(MatchMovedAway, { match: locked as LocalMatch, events, online: true, onBack: () => {}, onOpen: () => {} }),
  );
  expect(markup).toContain('This match moved to another phone');
  expect(markup).toContain('1 tap from this phone was not added');
  expect(markup).toContain('Take scoring back to this phone');
  const offline = renderToStaticMarkup(
    createElement(MatchMovedAway, { match: { ...locked, state: { ...locked.state } }, events: events.map((e) => ({ ...e, syncStatus: 'SYNCED' as const })), online: false, onBack: () => {}, onOpen: () => {} }),
  );
  expect(offline).toContain('Nothing was lost');
  expect(offline).toContain('You need internet to move a match to this phone.');
});
