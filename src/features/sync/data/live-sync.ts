import { ApiError, type AccountSession } from '../../identity/data/auth-client';
import { restoreSession } from '../../identity/data/session-store';
import { db, type RaidzOnDatabase } from '../../matches/data/match-repository';
import { needsSync, syncMatch } from './sync-matches';

/**
 * Online scoring: every recorded event is sent to the server immediately, one upload at a time
 * per match. Taps made while an upload is running are sent right after it (never a 15s wait).
 * The phone keeps its copy, so a dropped connection loses nothing and retries automatically.
 */
export type LiveSyncStatus = 'synced' | 'saving' | 'retrying' | 'offline' | 'local' | 'error';
export interface LiveSyncState {
  status: LiveSyncStatus;
  message: string;
  retryAt?: number;
}

const RETRY_SECONDS = [1, 2, 5, 10, 20, 30];
const states = new Map<string, LiveSyncState>();
const listeners = new Set<() => void>();
const running = new Map<string, Promise<void>>();
const dirty = new Set<string>();
const retries = new Map<string, { attempt: number; timer: ReturnType<typeof setTimeout> }>();

function set(matchId: string, state: LiveSyncState) {
  states.set(matchId, state);
  for (const listener of listeners) listener();
}
export function liveSyncState(matchId: string): LiveSyncState | undefined {
  return states.get(matchId);
}
export function subscribeLiveSync(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Runs uploads for one match strictly one after another (shared with the background sync loop). */
export function runSerialized(matchId: string, work: () => Promise<void>): Promise<void> {
  const previous = running.get(matchId) ?? Promise.resolve();
  const next = previous.then(work);
  // The queue's own copy never rejects (the caller gets the real result), so a failed upload
  // cannot surface as an unhandled promise rejection.
  const tracked: Promise<void> = next.then(() => undefined, () => undefined).finally(() => {
    if (running.get(matchId) === tracked) running.delete(matchId);
  });
  running.set(matchId, tracked);
  return next;
}

export function describeFailure(error: unknown) {
  if (error instanceof ApiError && error.status === 401) return { retry: false, message: 'Sign in again to keep sharing this match live.' };
  if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429)
    return { retry: false, message: error.message };
  if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError'))
    return { retry: true, message: 'The server is waking up. Retrying — scores are safe on this phone.' };
  return { retry: true, message: 'Connection problem. Retrying — scores are safe on this phone.' };
}

/** Send this match's pending events now. Safe to call after every tap. */
export async function pushNow(
  matchId: string,
  options: { database?: RaidzOnDatabase; session?: AccountSession | null; online?: boolean; sync?: typeof syncMatch } = {},
): Promise<void> {
  const database = options.database ?? db;
  const sync = options.sync ?? syncMatch;
  const account = options.session !== undefined ? options.session : await restoreSession().catch(() => null);
  const match = await database.matches.get(matchId);
  if (!match) return;
  const owner = match.serverAccountId ?? match.localAccountId;
  if (!account || !owner || owner !== account.accountId || match.ownerSessionId !== account.deviceId || match.scoringDelegated) {
    set(matchId, { status: 'local', message: 'Saved on this phone. Sign in before starting a match to share it live.' });
    return;
  }
  if (!(options.online ?? navigator.onLine)) {
    set(matchId, { status: 'offline', message: 'Offline. Scores are saved on this phone and upload when you reconnect.' });
    return;
  }
  clearRetry(matchId);
  if (running.has(matchId)) {
    dirty.add(matchId);
    // Our own upload loop picks the tap up; if the running job was the background sync instead,
    // nobody reads the flag, so send it as soon as that job finishes.
    return running.get(matchId)!.catch(() => undefined).then(() => {
      if (dirty.has(matchId)) return pushNow(matchId, options);
    });
  }
  return runSerialized(matchId, async () => {
    do {
      dirty.delete(matchId);
      const latest = await database.matches.get(matchId);
      if (!latest || !needsSync(latest)) break;
      set(matchId, { status: 'saving', message: 'Sending…' });
      try {
        await sync(matchId, account, database);
      } catch (error) {
        const failure = describeFailure(error);
        if (failure.retry) scheduleRetry(matchId, failure.message, options);
        else set(matchId, { status: 'error', message: failure.message });
        return;
      }
    } while (dirty.has(matchId));
    retries.delete(matchId);
    set(matchId, { status: 'synced', message: 'Live — watchers see every point.' });
  }).catch(() => undefined);
}

function scheduleRetry(matchId: string, message: string, options: Parameters<typeof pushNow>[1]) {
  const attempt = (retries.get(matchId)?.attempt ?? 0) + 1;
  const seconds = RETRY_SECONDS[Math.min(attempt - 1, RETRY_SECONDS.length - 1)];
  clearRetry(matchId);
  const timer = setTimeout(() => { void pushNow(matchId, options); }, seconds * 1000);
  retries.set(matchId, { attempt, timer });
  set(matchId, { status: 'retrying', message, retryAt: Date.now() + seconds * 1000 });
}
function clearRetry(matchId: string) {
  const pending = retries.get(matchId);
  if (pending) clearTimeout(pending.timer);
}

/** Called by the background sync loop when it uploaded a match successfully. */
export function markSynced(matchId: string) {
  clearRetry(matchId);
  retries.delete(matchId);
  set(matchId, { status: 'synced', message: 'Live — watchers see every point.' });
}

/** Test helper. */
export function resetLiveSync() {
  for (const { timer } of retries.values()) clearTimeout(timer);
  retries.clear(); states.clear(); running.clear(); dirty.clear(); listeners.clear();
}
