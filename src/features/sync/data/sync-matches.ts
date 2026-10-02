import Dexie from 'dexie';
import { db, type RaidzOnDatabase } from '../../matches/data/match-repository';
import { api, type AccountSession } from '../../identity/data/auth-client';
import { clockStartsWithFirstRaid, isScorable, type LocalMatch, type MatchEvent, type MatchState } from '../../scoring/domain/match-types';

interface Registration {
  matchId: string;
  rulesetVersion: string;
  version: number;
  state: MatchState;
}
interface Acknowledgement {
  eventId: string;
  acceptedVersion: number;
  currentVersion: number;
  state: MatchState;
}
export interface SyncTransport {
  claim(body: unknown): Promise<Registration>;
  append(matchId: string, body: unknown): Promise<Acknowledgement>;
  linkFixture?(tournamentId: string, fixtureId: string, matchId: string): Promise<unknown>;
}
export const SYNC_TIMEOUT_MS = 45_000;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
/**
 * Removes leftovers of a scoring tap that was only half saved (an event row without the match
 * update, or two rows for the same step). Keeps the chain of events that leads to the saved
 * score, so the upload is not blocked by a "gap". Only unsent events are ever removed.
 */
export function repairHistory(matchId: string, database: RaidzOnDatabase = db) {
  return database.transaction('rw', database.matches, database.events, () =>
    Dexie.Promise.all([
      database.matches.get(matchId),
      database.events.where('matchId').equals(matchId).toArray(),
    ]).then(([match, events]) => {
      if (!match) return 0;
      const bySequence = new Map<number, MatchEvent[]>();
      for (const event of events) bySequence.set(event.sequence, [...(bySequence.get(event.sequence) ?? []), event]);
      const remove: string[] = events
        .filter((event) => event.sequence > match.version && event.syncStatus !== 'SYNCED')
        .map((event) => event.id);
      let expected: MatchState = match.state;
      for (let sequence = match.version; sequence >= 1; sequence--) {
        const candidates = bySequence.get(sequence) ?? [];
        if (candidates.length <= 1) {
          if (!candidates[0]) break;
          expected = candidates[0].before;
          continue;
        }
        const keep = candidates.find((event) => canonical(event.after) === canonical(expected));
        if (!keep) break;
        remove.push(...candidates.filter((event) => event !== keep && event.syncStatus !== 'SYNCED').map((event) => event.id));
        expected = keep.before;
      }
      return remove.length ? database.events.bulkDelete(remove).then(() => remove.length) : 0;
    }),
  );
}
export async function syncMatch(
  matchId: string,
  account: AccountSession,
  database = db,
  // 45s allows a sleeping server (e.g. Render free tier) to wake up instead of failing the upload.
  transport: SyncTransport = {
    claim: (body) => api('/matches', body, account.token, SYNC_TIMEOUT_MS),
    append: (id, body) => api(`/matches/${id}/events`, body, account.token, SYNC_TIMEOUT_MS),
    linkFixture: (tournamentId, fixtureId, id) =>
      api(
        `/tournaments/${tournamentId}/fixtures/${fixtureId}/match`,
        { matchId: id },
        account.token,
        SYNC_TIMEOUT_MS,
      ),
  },
) {
  try {
    await repairHistory(matchId, database);
    const snapshot = await database.transaction(
      'r',
      database.matches,
      database.events,
      () =>
        Dexie.Promise.all([
          database.matches.get(matchId),
          database.events.where('matchId').equals(matchId).sortBy('sequence'),
        ]).then(([match, events]) => ({ match, events })),
    );
    const { match, events } = snapshot;
    if (!match) throw new Error('Match not found.');
    if (!match.localAccountId && !match.serverAccountId)
      throw new Error('Review and claim this guest match before syncing.');
    if (match.localAccountId && match.localAccountId !== account.accountId)
      throw new Error('Sign in to the account that created this match.');
    if (!isScorable(match.rulesetVersion))
      throw new Error('This older ruleset cannot be synced yet. Its local history is preserved.');
    if (match.ownerSessionId !== account.deviceId)
      throw new Error('Only the original scoring device can upload this match.');
    if (match.serverAccountId && match.serverAccountId !== account.accountId)
      throw new Error('Sign in to the account that already owns this match.');
    if (
      events.length !== match.version ||
      events.some(
        (event, index) =>
          event.sequence !== index + 1 ||
          event.baseVersion !== index ||
          event.scorerSessionId !== account.deviceId,
      )
    )
      throw new Error('Local history has a gap. Upload stopped; your history is preserved.');
    // Older v2 saves have no initial snapshot. Before the first event the roster is still original.
    const initial = structuredClone(match.initialState ?? events[0]?.before ?? match.state);
    initial.clock = {
      remainingMs: initial.halfMinutes * 60_000,
      startedAt: clockStartsWithFirstRaid(match.rulesetVersion) ? null : Date.parse(match.createdAt),
    };
    const atVersion = (version: number) => (version === 0 ? initial : events[version - 1]?.after);
    const checkState = (version: number, state: MatchState) => {
      if (
        !Number.isInteger(version) ||
        version < 0 ||
        version > match.version ||
        canonical(atVersion(version)) !== canonical(state)
      )
        throw new Error(
          'Server and device history differ. Upload stopped; no local scores were replaced.',
        );
    };
    const registration = await transport.claim({
      rulesetVersion: match.rulesetVersion,
      matchId,
      teams: initial.teams.map((team) => ({
        name: team.name,
        players: team.players.map(({ id, name, phone }) => ({ id, name, phone })),
      })),
      firstTurn: initial.firstTurn,
      halfMinutes: initial.halfMinutes,
      raidSeconds: initial.raidSeconds,
      startedAt: Date.parse(match.createdAt),
    });
    if (registration.matchId !== matchId || registration.rulesetVersion !== match.rulesetVersion)
      throw new Error('Unexpected server match acknowledgement.');
    checkState(registration.version, registration.state);
    // The server has fewer events than this phone marked as sent (e.g. its database was reset).
    // The history up to the server's version matched, so send the rest again.
    const resend = events.filter((event) => event.syncStatus === 'SYNCED' && event.sequence > registration.version);
    if (resend.length) {
      await database.events.bulkUpdate(resend.map((event) => ({ key: event.id, changes: { syncStatus: 'PENDING' as const } })));
      for (const event of resend) event.syncStatus = 'PENDING';
    }
    await database.matches.update(matchId, {
      serverAccountId: account.accountId,
      serverVersion: registration.version,
      syncError: '',
    });
    for (const event of events) {
      if (event.syncStatus === 'SYNCED') continue;
      const ack = await transport.append(matchId, {
        id: event.id,
        baseVersion: event.baseVersion,
        rulesetVersion: event.rulesetVersion,
        occurredAt: Date.parse(event.createdAt),
        intent: event.intent,
      });
      if (
        ack.eventId !== event.id ||
        ack.acceptedVersion !== event.sequence ||
        ack.currentVersion < ack.acceptedVersion
      )
        throw new Error('Unexpected server event acknowledgement.');
      checkState(ack.currentVersion, ack.state);
      await database.transaction('rw', database.matches, database.events, () =>
        database.events
          .update(event.id, { syncStatus: 'SYNCED' })
          .then(() => database.matches.get(matchId))
          .then((latest) =>
            latest
              ? database.matches.update(matchId, {
                  serverVersion: Math.max(latest.serverVersion ?? 0, ack.currentVersion),
                  syncError: '',
                })
              : 0,
          ),
      );
    }
    if (match.fixtureRef && !match.fixtureRef.linked) {
      if (!transport.linkFixture)
        throw new Error('Fixture linking is unavailable. Retry synchronization.');
      await transport.linkFixture(
        match.fixtureRef.tournamentId,
        match.fixtureRef.fixtureId,
        matchId,
      );
      await database.matches.update(matchId, {
        fixtureRef: { ...match.fixtureRef, linked: true },
        syncError: '',
      });
    }
  } catch (error) {
    await database.matches.update(matchId, {
      syncError: error instanceof Error ? error.message : 'Unable to sync.',
    });
    throw error;
  }
}
export function needsSync(match: LocalMatch) {
  return (
    !match.serverAccountId ||
    match.serverVersion !== match.version ||
    !!match.syncError ||
    !!(match.fixtureRef && !match.fixtureRef.linked)
  );
}
