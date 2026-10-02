import { useEffect, useState } from 'react';
import { liveSyncState, subscribeLiveSync, type LiveSyncState } from './data/live-sync';

/** Scorer-facing indicator: is this match reaching the server and its watchers right now? */
export function LiveSyncBadge({
  matchId,
  online,
  pending = false,
  syncError = '',
}: {
  matchId: string;
  online: boolean;
  /** The phone has scores the server has not acknowledged yet. */
  pending?: boolean;
  /** Last upload failure saved with the match. */
  syncError?: string;
}) {
  const [state, setState] = useState<LiveSyncState | undefined>(() => liveSyncState(matchId));
  useEffect(() => {
    setState(liveSyncState(matchId));
    return subscribeLiveSync(() => setState(liveSyncState(matchId)));
  }, [matchId]);
  const shown: LiveSyncState = !online
    ? { status: 'offline', message: 'Offline. Scores are saved on this phone and upload when you reconnect.' }
    : state?.status === 'synced' && pending
      ? syncError
        ? { status: 'error', message: `Not live: ${syncError}` }
        : { status: 'saving', message: 'Sending the latest scores…' }
      : state ?? { status: 'saving', message: 'Connecting…' };
  return (
    <p className={`live-sync-badge live-sync-${shown.status}`} aria-live="polite">
      <i aria-hidden="true" />
      {shown.message}
    </p>
  );
}
