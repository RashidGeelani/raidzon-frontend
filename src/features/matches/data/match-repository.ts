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
import { matchNow, notBefore } from '../../scoring/match-clock';

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
  /** jersey: the shirt number as typed (required for every match player, 0-999). */
  players: { name: string; phone: string; jersey?: string }[];
}
/** A shirt number as typed in setup: 1 to 3 digits, 0-999. Returns null when it isn't one. */
export function parseJersey(value: string | number | undefined | null): number | null {
  const text = String(value ?? '').trim();
  return /^[0-9]{1,3}$/.test(text) ? Number(text) : null;
}
export interface SetupInput {
  fixtureRef?: { tournamentId: string; fixtureId: string; knockout?: boolean };
  teams: [TeamInput, TeamInput];
  firstTurn: Side;
  halfMinutes: number;
  /** Ignored: every raid is the standard {@link RAID_SECONDS}. Kept so older callers still compile. */
  raidSeconds?: number;
  /** Quick match with filled-in names: kept out of player stats and leaderboards. */
  practice?: boolean;
}
/** Standard kabaddi raid time. It is not a setting anywhere in the app. */
export const RAID_SECONDS = 30;
export function normalizePhone(value: string) {
  const phone = parsePhoneNumberFromString(value, 'IN');
  if (!phone?.isValid())
    throw new Error(
      'Enter a valid phone number, including country code for numbers outside India.',
    );
  return phone.number;
}

/** Players already saved on this phone (name + canonical number), for setup suggestions. */
export async function recentPlayers(database = db): Promise<{ name: string; phone: string }[]> {
  const rows = await database.players.toArray();
  return rows
    .filter((player) => player.phone && player.name)
    .map(({ name, phone }) => ({ name, phone }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 300);
}

export async function sessionId(database = db) {
  return database.transaction('rw', database.metadata, () =>
    database.metadata.get('scorer-session').then((existing) => {
      if (existing) return existing.value;
      const value = crypto.randomUUID();
      return database.metadata.add({ key: 'scorer-session', value }).then(() => value);
    }),
  );
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
    input.halfMinutes > 60
  )
    throw new Error('Use 1–60 minutes per half.');
  const normalized = input.teams.map((t) => ({
    ...t,
    // Phones are optional for a quick match; tournament fixtures need them to check the roster.
    players: t.players.map((p) => ({
      name: p.name.trim(),
      phone: !p.phone.trim() && !input.fixtureRef ? '' : normalizePhone(p.phone),
      jersey: parseJersey(p.jersey),
    })),
  }));
  // Scorers pick players by the number on their shirt, so every player needs one.
  for (const team of normalized) {
    if (team.players.some((p) => p.jersey === null))
      throw new Error(`Enter a jersey number (0–999) for every ${team.name.trim() || 'team'} player.`);
    const numbers = team.players.map((p) => p.jersey);
    const repeated = numbers.find((n, i) => numbers.indexOf(n) !== i);
    if (repeated !== undefined)
      throw new Error(`Jersey ${repeated} is used twice in ${team.name.trim()}. Each player needs a different number.`);
  }
  const phones = normalized.flatMap((t) => t.players.map((p) => p.phone)).filter(Boolean);
  if (new Set(phones).size !== phones.length)
    throw new Error('Each player must have a unique phone number across both teams.');
  if (normalized.some((t) => t.players.some((p) => !p.name)))
    throw new Error('Every player needs a name.');
  // Reads happen first and the writes run as one short Dexie chain: a transaction body with
  // native async/await can be committed early by some mobile browsers ("Transaction committed
  // too early"), which made Start match fail.
  const build = async () => {
    const localAccountId = (await database.metadata.get('scoring-account'))?.value;
    const known = await database.players.where('phone').anyOf(phones).toArray();
    const byPhone = new Map(known.map((player) => [player.phone, player]));
    const added: LocalPlayer[] = [];
    const teams: Team[] = normalized.map((team) => ({
      name: team.name.trim(),
      queue: [],
      activeSubstitutions: 0,
      players: team.players.map((candidate, index) => {
        // Without a phone a player is known only in this match.
        const jersey = candidate.jersey!;
        if (!candidate.phone)
          return { name: candidate.name, phone: '', id: crypto.randomUUID(), status: index < 7 ? 'ACTIVE' : 'BENCH', raidPoints: 0, tacklePoints: 0, jersey } as Player;
        let identity = byPhone.get(candidate.phone);
        if (!identity) {
          // The number belongs to this match's team, not to the player, so it isn't stored with them.
          identity = { name: candidate.name, phone: candidate.phone, id: crypto.randomUUID() };
          byPhone.set(candidate.phone, identity);
          added.push(identity);
        }
        // Reuse identity without allowing setup to overwrite protected personal data.
        return { ...identity, status: index < 7 ? 'ACTIVE' : 'BENCH', raidPoints: 0, tacklePoints: 0, jersey } as Player;
      }),
    }));
    const now = matchNow();
    const match: LocalMatch = {
      fixtureRef: input.fixtureRef ? { ...input.fixtureRef, linked: false } : undefined,
      rulesetVersion: CURRENT_RULESET,
      ...(input.practice && !input.fixtureRef ? { practice: true } : {}),
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
        raidSeconds: RAID_SECONDS,
        // v4: the match clock starts with the first raid, not when the match is set up.
        clock: { remainingMs: input.halfMinutes * 60_000, startedAt: clockStartsWithFirstRaid(CURRENT_RULESET) ? null : now },
        raidClock: { remainingMs: RAID_SECONDS * 1000, startedAt: null },
        currentRaiderId: null,
        expiryReviewed: false,
      },
    };
    match.initialState = structuredClone(match.state);
    return { match, added };
  };
  for (let attempt = 0; ; attempt++) {
    const { match, added } = await build();
    try {
      await database.transaction('rw', database.matches, database.players, () =>
        database.players.bulkAdd(added).then(() => database.matches.add(match)),
      );
      return match;
    } catch (error) {
      // Another tab saved one of these phone numbers in between: read again and retry once.
      if (attempt === 0 && error instanceof Error && /Constraint|BulkError/i.test(error.name)) continue;
      throw error;
    }
  }
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
  eventId: string = crypto.randomUUID(),
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
        notBefore(Date.parse(match.updatedAt));
        const now = matchNow();
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

/** Removes a match and its events from this phone. */
export async function deleteLocalMatch(matchId: string, database = db) {
  await database.transaction('rw', database.matches, database.events, () =>
    database.events
      .where('matchId')
      .equals(matchId)
      .delete()
      .then(() => database.matches.delete(matchId)),
  );
}
