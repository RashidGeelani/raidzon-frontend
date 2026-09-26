import { db } from '../../matches/data/match-repository';
import { api, type AccountSession } from '../../identity/data/auth-client';
import type { LocalMatch, MatchState } from '../../scoring/domain/match-types';

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
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export async function syncMatch(
  matchId: string,
  account: AccountSession,
  database = db,
  transport: SyncTransport = {
    claim: (body) => api('/matches', body, account.token),
    append: (id, body) => api(`/matches/${id}/events`, body, account.token),
  },
) {
  try {
    const snapshot = await database.transaction(
      'r',
      database.matches,
      database.events,
      async () => ({
        match: await database.matches.get(matchId),
        events: await database.events.where('matchId').equals(matchId).sortBy('sequence'),
      }),
    );
    const { match, events } = snapshot;
    if (!match) throw new Error('Match not found.');
    if (match.localAccountId && match.localAccountId !== account.accountId)
      throw new Error('Sign in to the account that created this match.');
    if (!['raidzon-v2', 'raidzon-v3'].includes(match.rulesetVersion ?? ''))
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
      startedAt: Date.parse(match.createdAt),
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
    const registration = await transport.claim({ rulesetVersion: match.rulesetVersion,
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
    if (
      events.some((event) => event.syncStatus === 'SYNCED' && event.sequence > registration.version)
    )
      throw new Error(
        'Server history is behind a previously saved acknowledgement. Upload stopped.',
      );
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
      await database.transaction('rw', database.matches, database.events, async () => {
        await database.events.update(event.id, { syncStatus: 'SYNCED' });
        const latest = await database.matches.get(matchId);
        if (latest)
          await database.matches.update(matchId, {
            serverVersion: Math.max(latest.serverVersion ?? 0, ack.currentVersion),
            syncError: '',
          });
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
  return !match.serverAccountId || match.serverVersion !== match.version || !!match.syncError;
}
