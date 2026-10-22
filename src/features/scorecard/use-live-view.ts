import { useEffect, useState } from 'react';
import { delayQueue } from '../overlay/overlay-model';
import { watchMatch, type LiveConnection, type LiveStateUpdate } from './live-socket';
import type { LiveView, ViewerState } from './viewer-state';

/**
 * A public match kept up to date: live push over WebSocket, polling every 10s while the socket
 * reconnects. `now` is the match clock time (in the scoring phone's time) for the raid and half
 * countdowns, ticking 5 times a second. delayMs holds every update back (the stream overlay's
 * ?delay), and `now` runs the same amount behind so the clocks match the delayed score.
 */
export function useLiveView(matchId: string, delayMs = 0) {
  const [view, setView] = useState<LiveView | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [anchor, setAnchor] = useState({ server: 0, local: performance.now() });
  const [tick, setTick] = useState(performance.now());
  const [connection, setConnection] = useState<LiveConnection>('connecting');
  useEffect(() => {
    setView(null);
    setUnavailable(false);
    let latest = -1;
    const later = delayQueue<() => void>(delayMs, (apply) => apply());
    const stop = watchMatch<LiveView>(matchId, {
      onView: (result) => {
        if (result.version < latest) return; // ignore an older poll that arrives after a newer push
        latest = result.version;
        setAnchor({ server: result.serverTime, local: performance.now() });
        later.push(() => { setView(result); setUnavailable(false); });
      },
      // Instant update from the scorer's tap; keeps the event list and players' own names until
      // the full view arrives a moment later.
      onState: (update: LiveStateUpdate) => {
        if (update.version <= latest) return;
        latest = update.version;
        setAnchor({ server: update.serverTime, local: performance.now() });
        const incoming = update.state as ViewerState;
        later.push(() => setView((current) => current && {
          ...current,
          version: update.version,
          serverTime: update.serverTime,
          state: {
            ...incoming,
            teams: incoming.teams.map((team, side) => ({
              ...team,
              players: team.players.map((player) => ({
                ...player,
                name: current.state.teams[side]?.players.find((known) => known.id === player.id)?.name ?? player.name,
              })),
            })),
          },
        }));
      },
      onUnavailable: () => later.push(() => { setView(null); setUnavailable(true); }),
      onConnection: setConnection,
    });
    const clock = setInterval(() => setTick(performance.now()), 200);
    return () => { stop(); later.stop(); clearInterval(clock); };
  }, [matchId, delayMs]);
  // Match clocks are in the scoring phone's time: shift server time by that phone's clock error.
  const now = anchor.server - (view?.clockOffset ?? 0) + Math.max(0, tick - anchor.local) - delayMs;
  return { view, now, connection, unavailable };
}
