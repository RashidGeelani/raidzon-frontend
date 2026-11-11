// "Continue scoring here": move a live match from another phone to this one.
// The server moves scoring to this phone and sends the whole history; the phone rebuilds every
// raid with the same engine it scores with and only saves the match if it lands on the server's score.
import { api, type AccountSession } from '../../identity/data/auth-client';
import { db, type RaidzOnDatabase } from '../../matches/data/match-repository';
import { applyRecordedEvent } from '../../scoring/domain/apply-recorded-event';
import { isScorable, type LocalMatch, type MatchEvent, type MatchIntent, type MatchState, type RulesetVersion } from '../../scoring/domain/match-types';
import { canonical, SYNC_TIMEOUT_MS } from './sync-matches';
import { markSynced } from './live-sync';

export interface TakeoverResponse {
  matchId: string;
  rulesetVersion: RulesetVersion;
  version: number;
  setup: MatchState;
  state: MatchState;
  events: { id: string; baseVersion: number; rulesetVersion: string; occurredAt: number; intent: MatchIntent }[];
  practice: boolean;
  createdAt: number;
  fixture: { tournamentId: string; fixtureId: string; knockout: boolean } | null;
}

export const MISMATCH =
  'The match history from the server could not be checked on this phone, so nothing was saved. Try again in a moment.';

/** Rebuilds the match from the server's history. Throws if it doesn't land exactly on the server's score. */
export function rebuildTakeover(response: TakeoverResponse, account: Pick<AccountSession, 'accountId' | 'deviceId'>) {
  if (!isScorable(response.rulesetVersion))
    throw new Error('This match uses rules this version of the app cannot score. Update the app, then try again.');
  const events: MatchEvent[] = [];
  let state = structuredClone(response.setup);
  try {
    for (const [index, item] of response.events.entries()) {
      if (item.baseVersion !== index || item.rulesetVersion !== response.rulesetVersion) throw new Error(MISMATCH);
      const result = applyRecordedEvent(state, item.intent, item.occurredAt, events, response.rulesetVersion);
      events.push({
        id: item.id,
        matchId: response.matchId,
        sequence: index + 1,
        baseVersion: index,
        rulesetVersion: response.rulesetVersion,
        scorerSessionId: account.deviceId,
        createdAt: new Date(item.occurredAt).toISOString(),
        intent: item.intent,
        components: result.components,
        summary: result.summary,
        before: result.before,
        after: result.state,
        syncStatus: 'SYNCED',
      });
      state = result.state;
    }
  } catch {
    throw new Error(MISMATCH);
  }
  if (events.length !== response.version || canonical(state) !== canonical(response.state)) throw new Error(MISMATCH);
  const createdAt = new Date(response.createdAt).toISOString();
  const match: LocalMatch = {
    id: response.matchId,
    name: `${state.teams[0].name} vs ${state.teams[1].name}`,
    rulesetVersion: response.rulesetVersion,
    ...(response.practice ? { practice: true } : {}),
    ...(response.fixture ? { fixtureRef: { ...response.fixture, linked: true } } : {}),
    createdAt,
    updatedAt: events.at(-1)?.createdAt ?? createdAt,
    ownerSessionId: account.deviceId,
    localAccountId: account.accountId,
    serverAccountId: account.accountId,
    serverVersion: response.version,
    takenOver: true,
    version: response.version,
    initialState: structuredClone(response.setup),
    state,
  };
  return { match, events };
}

/** Replaces this phone's copy of the match (if any) with the rebuilt one, all at once. */
export function saveTakeover({ match, events }: ReturnType<typeof rebuildTakeover>, database: RaidzOnDatabase = db) {
  return database.transaction('rw', database.matches, database.events, () =>
    database.events
      .where('matchId')
      .equals(match.id)
      .delete()
      .then(() => database.events.bulkAdd(events))
      .then(() => database.matches.put(match)),
  );
}

/** Taps on this phone the server never received, oldest first. */
export function unsentTaps(matchId: string, database: RaidzOnDatabase = db) {
  return database.events
    .where('matchId')
    .equals(matchId)
    .sortBy('sequence')
    .then((events) => events.filter((event) => event.syncStatus !== 'SYNCED'));
}

/**
 * Moves scoring to this phone. proofToken comes from a fresh OTP on this phone; without one the server only
 * answers for the phone that already scores the match (used to finish an import that failed half-way).
 */
export async function continueScoringHere(
  matchId: string,
  account: AccountSession,
  proofToken?: string,
  database: RaidzOnDatabase = db,
  request: (body: unknown) => Promise<TakeoverResponse> = (body) =>
    api(`/matches/${matchId}/takeover`, body, account.token, SYNC_TIMEOUT_MS),
) {
  const response = await request(proofToken ? { verificationToken: proofToken } : {});
  if (response.matchId !== matchId) throw new Error(MISMATCH);
  const rebuilt = rebuildTakeover(response, account);
  await saveTakeover(rebuilt, database);
  markSynced(matchId);
  return rebuilt.match;
}
