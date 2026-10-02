import Dexie, { type Table } from 'dexie';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { applyRecordedEvent } from '../../scoring/domain/apply-recorded-event';
export { undoTarget } from '../../scoring/domain/apply-recorded-event';
import {
  CURRENT_RULESET,
  clockStartsWithFirstRaid,
  isScorable,
  type LocalMatch,
  type MatchEvent,
  type MatchIntent,
  type Player,
  type Side,
  type Team,
} from '../../scoring/domain/match-types';
import type { TeamDetail } from '../../teams/data/team-types';

export interface CachedTeam {
  id: string;
  accountId: string;
  detail: TeamDetail;
  savedAt: number;
}
interface LocalPlayer {
  id: string;
  phone: string;
  name: string;
}
export class RaidzOnDatabase extends Dexie {
  matches!: Table<LocalMatch, string>;
  events!: Table<MatchEvent, string>;
  players!: Table<LocalPlayer, string>;
  metadata!: Table<{ key: string; value: string }, string>;
  teams!: Table<CachedTeam, string>;
  constructor(name = 'raidzon') {
    super(name);
    this.version(1).stores({
      matches: 'id, updatedAt',
      events: 'id, matchId, &[matchId+sequence]',
      players: 'id, &phone',
      metadata: 'key',
    });
    // Saved squads cached per account so a lineup can be picked offline.
    this.version(2).stores({ teams: 'id, accountId' });
  }
}
export const db = new RaidzOnDatabase();

export interface TeamInput {
  name: string;
  players: { name: string; phone: string }[];
}
export interface SetupInput {
  fixtureRef?: { tournamentId: string; fixtureId: string };
  teams: [TeamInput, TeamInput];
  firstTurn: Side;
  halfMinutes: number;
  raidSeconds: number;
}
export function normalizePhone(value: string) {
  const phone = parsePhoneNumberFromString(value, 'IN');
  if (!phone?.isValid())
    throw new Error(
      'Enter a valid phone number, including country code for numbers outside India.',
    );
  return phone.number;
}

export async function sessionId(database = db) {
  return database.transaction('rw', database.metadata, async () => {
    const existing = await database.metadata.get('scorer-session');
    if (existing) return existing.value;
    const value = crypto.randomUUID();
    await database.metadata.add({ key: 'scorer-session', value });
    return value;
  });
}

export async function createMatch(
  input: SetupInput,
  ownerSessionId: string,
  database = db,
): Promise<LocalMatch> {
  if (
    input.teams.some((t) => !t.name.trim()) ||
    input.teams[0].name.trim().toLowerCase() === input.teams[1].name.trim().toLowerCase()
  )
    throw new Error('Enter two different team names.');
  if (input.teams.some((t) => t.players.length < 7 || t.players.length > 12))
    throw new Error('Each team needs seven starters and up to five substitutes.');
  if (input.firstTurn !== 0 && input.firstTurn !== 1)
    throw new Error('Choose the first raiding team.');
  if (
    !Number.isInteger(input.halfMinutes) ||
    input.halfMinutes < 1 ||
    input.halfMinutes > 60 ||
    !Number.isInteger(input.raidSeconds) ||
    input.raidSeconds < 5 ||
    input.raidSeconds > 120
  )
    throw new Error('Use 1–60 minutes per half and 5–120 seconds per raid.');
  const normalized = input.teams.map((t) => ({
    ...t,
    players: t.players.map((p) => ({ name: p.name.trim(), phone: normalizePhone(p.phone) })),
  }));
  const phones = normalized.flatMap((t) => t.players.map((p) => p.phone));
  if (new Set(phones).size !== phones.length)
    throw new Error('Each player must have a unique phone number across both teams.');
  if (normalized.some((t) => t.players.some((p) => !p.name)))
    throw new Error('Every player needs a name.');
  return database.transaction(
    'rw',
    database.matches,
    database.players,
    database.metadata,
    async () => {
      const localAccountId = (await database.metadata.get('scoring-account'))?.value;
      const teams: Team[] = [];
      for (const team of normalized) {
        const players: Player[] = [];
        for (const [index, candidate] of team.players.entries()) {
          let identity = await database.players.where('phone').equals(candidate.phone).first();
          if (!identity) {
            identity = { ...candidate, id: crypto.randomUUID() };
            await database.players.add(identity);
          }
          // Reuse identity without allowing setup to overwrite protected personal data.
          players.push({
            ...identity,
            status: index < 7 ? 'ACTIVE' : 'BENCH',
            raidPoints: 0,
            tacklePoints: 0,
          });
        }
        teams.push({ name: team.name.trim(), players, queue: [], activeSubstitutions: 0 });
      }
      const now = Date.now();
      const match: LocalMatch = {
        fixtureRef: input.fixtureRef ? { ...input.fixtureRef, linked: false } : undefined,
        rulesetVersion: CURRENT_RULESET,
        id: crypto.randomUUID(),
        name: `${teams[0].name} vs ${teams[1].name}`,
        createdAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
        ownerSessionId,
        localAccountId,
        version: 0,
        state: {
          teams: teams as [Team, Team],
          scores: [0, 0],
          tieScores: [0, 0],
          pairScores: [0, 0],
          tieRaids: [0, 0],
          tieBreakerRaiders: [[], []],
          lastTieRaiders: ['', ''],
          goldenPair: 0,
          half: 1,
          phase: 'REGULATION',
          status: 'LIVE',
          turn: input.firstTurn,
          firstTurn: input.firstTurn,
          raidNumber: 1,
          winner: null,
          halfMinutes: input.halfMinutes,
          raidSeconds: input.raidSeconds,
          // v4: the match clock starts with the first raid, not when the match is set up.
          clock: { remainingMs: input.halfMinutes * 60_000, startedAt: clockStartsWithFirstRaid(CURRENT_RULESET) ? null : now },
          raidClock: { remainingMs: input.raidSeconds * 1000, startedAt: null },
          currentRaiderId: null,
          expiryReviewed: false,
        },
      };
      match.initialState = structuredClone(match.state);
      await database.matches.add(match);
      return match;
    },
  );
}

/**
 * Records one scoring tap. The transaction body is a plain Dexie promise chain (no native
 * async/await): iOS Safari can otherwise commit the IndexedDB transaction before the body
 * finishes ("Transaction committed too early"), which skipped the live upload for that tap.
 */
export async function recordEvent(
  matchId: string,
  expectedVersion: number,
  ownerSessionId: string,
  intent: MatchIntent,
  eventId = crypto.randomUUID(),
  database = db,
): Promise<LocalMatch> {
  try {
    return await database.transaction('rw', database.matches, database.events, database.metadata, () =>
      Dexie.Promise.all([
        database.matches.get(matchId),
        database.metadata.get('scoring-account'),
        database.events.get(eventId),
        intent.type === 'UNDO'
          ? database.events.where('matchId').equals(matchId).toArray()
          : Dexie.Promise.resolve([] as MatchEvent[]),
      ]).then(([match, scoringAccount, existing, unsorted]) => {
        if (!match) throw new Error('Match not found.');
        if (!isScorable(match.rulesetVersion))
          throw new Error(
            'This match uses the previous rules. Its history is preserved; start a new match for the updated rules.',
          );
        if (match.scoringDelegated || match.ownerSessionId !== ownerSessionId)
          throw new Error('This scoring session is read-only.');
        const accountOwner = match.serverAccountId ?? match.localAccountId;
        if (accountOwner && scoringAccount?.value !== accountOwner)
          throw new Error('Sign in with the organizer account to score this match.');
        if (existing) {
          if (existing.matchId !== matchId || JSON.stringify(existing.intent) !== JSON.stringify(intent))
            throw new Error('Event ID was reused with different facts.');
          return match;
        }
        if (match.version !== expectedVersion)
          throw new Error('Another tab updated this match. Refresh its saved state before scoring.');
        const now = Math.max(Date.now(), Date.parse(match.updatedAt));
        const history = [...unsorted].sort((a, b) => a.sequence - b.sequence);
        const result = applyRecordedEvent(match.state, intent, now, history, match.rulesetVersion);
        const event: MatchEvent = {
          id: eventId,
          matchId,
          sequence: expectedVersion + 1,
          baseVersion: expectedVersion,
          rulesetVersion: match.rulesetVersion!,
          scorerSessionId: ownerSessionId,
          createdAt: new Date(now).toISOString(),
          intent,
          components: result.components,
          summary: result.summary,
          before: result.before,
          after: result.state,
          syncStatus: 'PENDING',
        };
        const updated: LocalMatch = { ...match, version: event.sequence, state: result.state, updatedAt: event.createdAt };
        // Rows past the saved version are leftovers of a tap that was never fully saved.
        return database.events
          .where('[matchId+sequence]')
          .between([matchId, event.sequence], [matchId, Dexie.maxKey], true, true)
          .delete()
          .then(() => database.events.add(event))
          .then(() => database.matches.put(updated))
          .then(() => updated);
      }),
    );
  } catch (error) {
    // The writes are atomic: if the event is stored, the tap was saved even though the browser
    // reported the transaction finishing early.
    if (error instanceof Error && error.name === 'PrematureCommitError') {
      const [saved, match] = await Promise.all([database.events.get(eventId), database.matches.get(matchId)]);
      if (saved && match && match.version >= saved.sequence) return match;
    }
    throw error;
  }
}
