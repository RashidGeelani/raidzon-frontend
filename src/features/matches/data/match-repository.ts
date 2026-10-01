import Dexie, { type Table } from 'dexie';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { applyRecordedEvent } from '../../scoring/domain/apply-recorded-event';
export { undoTarget } from '../../scoring/domain/apply-recorded-event';
import {
  type LocalMatch,
  type MatchEvent,
  type MatchIntent,
  type Player,
  type Side,
  type Team,
} from '../../scoring/domain/match-types';

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
  constructor(name = 'raidzon') {
    super(name);
    this.version(1).stores({
      matches: 'id, updatedAt',
      events: 'id, matchId, &[matchId+sequence]',
      players: 'id, &phone',
      metadata: 'key',
    });
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
        rulesetVersion: 'raidzon-v3',
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
          clock: { remainingMs: input.halfMinutes * 60_000, startedAt: now },
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

export async function recordEvent(
  matchId: string,
  expectedVersion: number,
  ownerSessionId: string,
  intent: MatchIntent,
  eventId = crypto.randomUUID(),
  database = db,
) {
  return database.transaction('rw', database.matches, database.events, database.metadata, async () => {
    const match = await database.matches.get(matchId);
    if (!match) throw new Error('Match not found.');
    if (!['raidzon-v2', 'raidzon-v3'].includes(match.rulesetVersion ?? ''))
      throw new Error(
        'This match uses the previous rules. Its history is preserved; start a new match for the updated rules.',
      );
    if (match.scoringDelegated || match.ownerSessionId !== ownerSessionId)
      throw new Error('This scoring session is read-only.');
    const accountOwner = match.serverAccountId ?? match.localAccountId;
    if (accountOwner && (await database.metadata.get('scoring-account'))?.value !== accountOwner)
      throw new Error('Sign in with the organizer account to score this match.');
    const existing = await database.events.get(eventId);
    if (existing) {
      if (
        existing.matchId !== matchId ||
        JSON.stringify(existing.intent) !== JSON.stringify(intent)
      )
        throw new Error('Event ID was reused with different facts.');
      return match;
    }
    if (match.version !== expectedVersion)
      throw new Error('Another tab updated this match. Refresh its saved state before scoring.');
    const now = Math.max(Date.now(), Date.parse(match.updatedAt));
    const history =
      intent.type === 'UNDO'
        ? (await database.events.where('matchId').equals(matchId).toArray()).sort(
            (a, b) => a.sequence - b.sequence,
          )
        : [];
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
    const updated = {
      ...match,
      version: event.sequence,
      state: result.state,
      updatedAt: event.createdAt,
    };
    await database.events.add(event);
    await database.matches.put(updated);
    return updated;
  });
}
