import { useEffect, useState } from 'react';
import { watchMatch, type LiveConnection, type LiveStateUpdate } from './live-socket';
import type { ClockState, MatchState, Player } from '../scoring/domain/match-types';

type ViewerState = Pick<MatchState, 'scores' | 'tieScores' | 'status' | 'phase' | 'half' | 'raidNumber' | 'turn' | 'currentRaiderId' | 'clock' | 'raidClock' | 'winner'> & {
  teams: { name: string; players: Omit<Player, 'phone'>[] }[];
};
interface LiveView { state: ViewerState; serverTime: number; lastSyncedAt: number; version: number; events: { id: string; summary: string; raidNumber: number; type: string }[] }
export function clockRemaining(clock: ClockState, now: number) {
  return Math.max(0, clock.remainingMs - (clock.startedAt == null ? 0 : Math.max(0, now - clock.startedAt)));
}
export function LiveMatchViewer({ matchId, onBack }: { matchId: string; onBack?: () => void }) {
  const [view, setView] = useState<LiveView | null>(null);
  const [message, setMessage] = useState('Connecting to the match…');
  const [anchor, setAnchor] = useState({ server: 0, local: performance.now() });
  const [tick, setTick] = useState(performance.now());
  const [connection, setConnection] = useState<LiveConnection>('connecting');
  useEffect(() => {
    setView(null);
    let latest = -1;
    // Live push over WebSocket; falls back to polling every 10s while the socket reconnects.
    const stop = watchMatch<LiveView>(matchId, {
      onView: (result) => {
        if (result.version < latest) return; // ignore an older poll that arrives after a newer push
        latest = result.version;
        setView(result); setAnchor({ server: result.serverTime, local: performance.now() }); setMessage('');
      },
      // Instant update from the scorer's tap; keeps the event list and players' own names until
      // the full view arrives a moment later.
      onState: (update: LiveStateUpdate) => {
        if (update.version <= latest) return;
        latest = update.version;
        const incoming = update.state as ViewerState;
        setView((current) => current && {
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
        });
        setAnchor({ server: update.serverTime, local: performance.now() });
      },
      onUnavailable: () => { setView(null); setMessage('This match is not available to watch.'); },
      onConnection: setConnection,
    });
    const clock = setInterval(() => setTick(performance.now()), 200);
    return () => { stop(); clearInterval(clock); };
  }, [matchId]);
  useEffect(() => {
    if (connection === 'reconnecting') setMessage((current) => current || 'Reconnecting… showing the latest update.');
    if (connection === 'live') setMessage((current) => (current.startsWith('Reconnecting') ? '' : current));
  }, [connection]);
  const state = view?.state;
  const now = anchor.server + Math.max(0, tick - anchor.local);
  const raider = state?.teams[state.turn].players.find((player) => player.id === state.currentRaiderId);
  const raidSeconds = state ? Math.ceil(clockRemaining(state.raidClock, now) / 1000) : 0;
  const halfSeconds = state ? Math.ceil(clockRemaining(state.clock, now) / 1000) : 0;
  return <section className="live-match-view" aria-label="Live match viewer">
    <header className="live-view-header">
      {onBack ? <button className="tournament-back" onClick={onBack} aria-label="Back to matches">←</button> : <a href="/">← Matches</a>}
      <span className="live-status">{state?.status.replaceAll('_', ' ') ?? 'MATCH'}</span>
      {connection === 'live' && state?.status !== 'COMPLETED' && <span className="live-push-dot" title="Updates instantly">● Real-time</span>}
      <small>{state ? `Half ${state.half} · ${Math.floor(halfSeconds / 60)}:${String(halfSeconds % 60).padStart(2, '0')}` : ''}</small>
    </header>
    {message && <p role="status">{message}</p>}
    {state && <>
      <div className="live-view-score">
        {state.teams.map((team, index) => <div key={index}><span className={`viewer-team-mark viewer-side-${index}`}>{team.name.slice(0, 3).toUpperCase()}</span><small>{team.name}</small><strong>{(state.phase === 'REGULATION' ? state.scores : state.tieScores)[index]}</strong><em>{state.status === 'COMPLETED' ? 'FINAL' : state.turn === index ? 'RAIDING ▲' : 'DEFENDING'}</em></div>)}
        <span className="live-raid-label">R{state.raidNumber}</span>
      </div>
      {state.phase !== 'REGULATION' && <p>{state.phase.replaceAll('_', ' ')} · Regulation {state.scores.join(' : ')}</p>}
      <h3 className="live-section-title">Current raid</h3>
      <div className="live-current-raider"><div><strong>{raider?.name ?? (state.status === 'COMPLETED' ? 'Match complete' : 'Waiting for the next raider')}</strong><small>{state.teams[state.turn].name} · Raid #{state.raidNumber}</small></div><span className={`live-countdown ${raidSeconds === 0 ? 'expired' : raider && raidSeconds <= 10 ? 'warning' : ''}`} aria-label="Raid time remaining">{raider ? raidSeconds : '—'}<small>seconds</small></span></div>
      {raider && raidSeconds === 0 && <p className="field-note">Time elapsed — waiting for the scorer’s decision.</p>}
      <h3 className="live-section-title">On court</h3>
      {state.teams.map((team, side) => <div className="live-court-team" key={side}><strong>{team.name}</strong><div className="live-player-chips">{team.players.map((player, index) => player.status === 'ACTIVE' && <span className={player.id === state.currentRaiderId ? 'current' : ''} key={player.id}><b title="Roster position">{index + 1}</b><small>{player.name}</small></span>)}</div></div>)}
      <h3 className="live-section-title">Substitutes</h3>
      {state.teams.map((team, side) => <div className="live-court-team" key={side}><strong>{team.name}</strong><p>{team.players.filter((player) => player.status === 'BENCH').map((player) => player.name).join(', ') || 'No substitutes'}</p></div>)}
      <h3 className="live-section-title">Match events</h3>
      <ol className="live-event-list">{view?.events.map((event) => <li key={event.id}><span>{event.summary}</span><small>R{event.raidNumber}</small></li>)}</ol>
      <p className="viewer-footnote">Viewer mode · Read only · Updates follow the scorer’s connection.<br />Last synced {new Date(view!.lastSyncedAt).toLocaleTimeString()}</p>
    </>}
  </section>;
}
