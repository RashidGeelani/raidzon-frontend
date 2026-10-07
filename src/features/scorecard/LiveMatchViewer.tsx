import { useEffect, useState } from 'react';
import { requestInstallNudge } from '../../app/install';
import { eventLabel } from '../scoring/domain/event-label';
import { milestones } from '../scoring/domain/match-summary';
import { isDoOrDie } from '../scoring/domain/match-types';
import { withJersey } from '../scoring/domain/jersey';
import { watchMatch, type LiveConnection, type LiveStateUpdate } from './live-socket';
import { ReportMatch } from './ReportMatch';
import type { ClockState, MatchState, Player } from '../scoring/domain/match-types';

type ViewerState = Pick<MatchState, 'scores' | 'tieScores' | 'status' | 'phase' | 'half' | 'raidNumber' | 'turn' | 'currentRaiderId' | 'clock' | 'raidClock' | 'winner'> & {
  teams: { name: string; players: Omit<Player, 'phone'>[] }[];
};
interface LiveView { state: ViewerState; serverTime: number; lastSyncedAt: number; version: number; /** Server clock minus the scoring phone's clock (ms). */ clockOffset?: number; events: { id: string; summary: string; raidNumber: number; type: string }[] }
export function clockRemaining(clock: ClockState, now: number) {
  return Math.max(0, clock.remainingMs - (clock.startedAt == null ? 0 : Math.max(0, now - clock.startedAt)));
}
type ViewerPlayer = ViewerState['teams'][number]['players'][number];
/** Best player by a score, ignoring zeros; ties keep the first found. */
function standout(state: ViewerState, score: (player: ViewerPlayer) => number) {
  let best: { player: ViewerPlayer; team: string; value: number } | null = null;
  state.teams.forEach((team) => team.players.forEach((player) => {
    const value = score(player);
    if (value > 0 && (!best || value > best.value)) best = { player, team: team.name, value };
  }));
  return best as { player: ViewerPlayer; team: string; value: number } | null;
}
/** The server reports the winner as 'TEAM_A' / 'TEAM_B' / 'DRAW'; the scorer's phone uses 0 / 1 / 'DRAW'. */
export function winnerSide(winner: unknown): 0 | 1 | 'DRAW' | null {
  if (winner === 0 || winner === 'TEAM_A') return 0;
  if (winner === 1 || winner === 'TEAM_B') return 1;
  return winner === 'DRAW' ? 'DRAW' : null;
}
const pts = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

export function LiveMatchViewer({ matchId, onBack }: { matchId: string; onBack?: () => void }) {
  const [view, setView] = useState<LiveView | null>(null);
  const [message, setMessage] = useState('Connecting to the match…');
  const [anchor, setAnchor] = useState({ server: 0, local: performance.now() });
  const [tick, setTick] = useState(performance.now());
  const [connection, setConnection] = useState<LiveConnection>('connecting');
  const [shareNote, setShareNote] = useState('');
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
  // After half a minute of watching, suggest installing for quicker live scores next time.
  const watching = !!view;
  useEffect(() => {
    if (!watching) return;
    const timer = setTimeout(() => requestInstallNudge('watching'), 30_000);
    return () => clearTimeout(timer);
  }, [watching]);
  const state = view?.state;
  // Match clocks are in the scoring phone's time: shift server time by that phone's clock error.
  const now = anchor.server - (view?.clockOffset ?? 0) + Math.max(0, tick - anchor.local);
  const raider = state?.teams[state.turn]?.players.find((player) => player.id === state.currentRaiderId);
  const raidSeconds = state ? Math.ceil(clockRemaining(state.raidClock, now) / 1000) : 0;
  const halfSeconds = state ? Math.ceil(clockRemaining(state.clock, now) / 1000) : 0;
  const completed = state?.status === 'COMPLETED';
  const finalScores = state ? (state.phase === 'REGULATION' ? state.scores : state.tieScores) : [0, 0];
  async function shareLink() {
    const title = state ? `${state.teams[0].name} vs ${state.teams[1].name}` : 'Kabaddi match';
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title, text: `Follow ${title} live on raidzOn`, url });
      else { await navigator.clipboard.writeText(url); setShareNote('Link copied'); setTimeout(() => setShareNote(''), 2500); }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setShareNote('Copy the address from your browser to share');
    }
  }
  return <section className="live-match-view" aria-label="Live match viewer">
    <header className="live-view-header">
      {onBack ? <button className="tournament-back" onClick={onBack} aria-label="Back to matches">←</button> : <a href="/">← Matches</a>}
      <span className="live-status">{state?.status.replaceAll('_', ' ') ?? 'MATCH'}</span>
      {connection === 'live' && state?.status !== 'COMPLETED' && <span className="live-push-dot" title="Updates instantly">● Real-time</span>}
      <button type="button" className="viewer-share" onClick={() => void shareLink()} aria-label="Share this match">{shareNote || 'Share'}</button>
      <small>{completed ? 'Full time' : state ? `Half ${state.half} · ${Math.floor(halfSeconds / 60)}:${String(halfSeconds % 60).padStart(2, '0')}` : ''}</small>
    </header>
    {message && <p role="status">{message}</p>}
    {state && <>
      <div className="live-view-score">
        {state.teams.map((team, index) => <div key={index}><span className={`viewer-team-mark viewer-side-${index}`}>{team.name.slice(0, 3).toUpperCase()}</span><small>{team.name}</small><strong>{(state.phase === 'REGULATION' ? state.scores : state.tieScores)[index]}</strong><em>{state.status === 'COMPLETED' ? 'FINAL' : state.turn === index ? 'RAIDING ▲' : 'DEFENDING'}</em></div>)}
        <span className="live-raid-label">R{state.raidNumber}</span>
      </div>
      {state.phase !== 'REGULATION' && <p>{state.phase.replaceAll('_', ' ')} · Regulation {state.scores.join(' : ')}</p>}
      {completed ? <FullTime state={state} scores={finalScores} /> : <>
      <h3 className="live-section-title">Current raid</h3>
      {isDoOrDie(state) && (state.status === 'LIVE' || state.status === 'PAUSED') && <div className="viewer-do-or-die" role="status"><strong>DO-OR-DIE RAID</strong><span>{state.teams[state.turn]?.name} must score or the raider is out</span></div>}
      <div className="live-current-raider"><div><strong>{raider ? withJersey(raider) : (state.status === 'COMPLETED' ? 'Match complete' : 'Waiting for the next raider')}</strong><small>{state.teams[state.turn].name} · Raid #{state.raidNumber}</small></div><span className={`live-countdown ${raidSeconds === 0 ? 'expired' : raider && raidSeconds <= 10 ? 'warning' : ''}`} aria-label="Raid time remaining">{raider ? raidSeconds : '—'}<small>seconds</small></span></div>
      {raider && raidSeconds === 0 && <p className="field-note">Time elapsed — waiting for the scorer’s decision.</p>}
      <h3 className="live-section-title">On court</h3>
      {state.teams.map((team, side) => <div className="live-court-team" key={side}><strong>{team.name}</strong><div className="live-player-chips">{team.players.map((player) => player.status === 'ACTIVE' && <span className={player.id === state.currentRaiderId ? 'current' : ''} key={player.id}><i className="court-dot" aria-hidden="true" /><small>{withJersey(player)}</small></span>)}</div></div>)}
      <h3 className="live-section-title">Substitutes</h3>
      {state.teams.map((team, side) => <div className="live-court-team" key={side}><strong>{team.name}</strong><p>{team.players.filter((player) => player.status === 'BENCH').map((player) => withJersey(player)).join(', ') || 'No substitutes'}</p></div>)}
      </>}
      <h3 className="live-section-title">Match events</h3>
      <ol className="live-event-list">{view?.events.map((event) => <li key={event.id}><span>{eventLabel(event.summary)}</span><small>R{event.raidNumber}</small></li>)}</ol>
      <p className="viewer-footnote">Viewer mode · Read only · Updates follow the scorer’s connection.<br />Last synced {new Date(view!.lastSyncedAt).toLocaleTimeString()}</p>
      <ReportMatch matchId={matchId} />
    </>}
  </section>;
}

function FullTime({ state, scores }: { state: ViewerState; scores: [number, number] | number[] }) {
  const winner = winnerSide(state.winner);
  const headline = winner === 'DRAW' || winner === null ? 'Match drawn' : `${state.teams[winner]?.name ?? 'Winner'} win`;
  const margin = Math.abs(scores[0] - scores[1]);
  const rows = [
    { label: 'Player of the match', icon: '★', best: standout(state, (p) => p.raidPoints + p.tacklePoints), unit: 'pt' },
    { label: 'Top raider', icon: '↗', best: standout(state, (p) => p.raidPoints), unit: 'raid pt' },
    { label: 'Top defender', icon: '⛨', best: standout(state, (p) => p.tacklePoints), unit: 'tackle pt' },
  ].filter((row) => row.best);
  return <section className="viewer-fulltime" aria-label="Full time">
    <p className="eyebrow">FULL TIME</p>
    <h3>{headline}</h3>
    <p className="viewer-fulltime-margin">{winner === 'DRAW' || winner === null ? `Level at ${scores[0]} – ${scores[1]}` : margin ? `By ${pts(margin, 'point')}` : 'Won on the tie-break'}</p>
    {rows.length > 0 && <div className="result-standouts">
      {rows.map((row, index) => <div key={row.label} className={`result-standout ${index === 0 ? 'featured' : ''}`}>
        <span className="result-standout-icon" aria-hidden="true">{row.icon}</span>
        <span className="result-standout-text"><small>{row.label}</small><strong>{row.best!.player.name}</strong><em>{row.best!.team}</em>{milestones(row.best!.player).length > 0 && <span className="milestone-tags">{milestones(row.best!.player).map((tag) => <span key={tag} className={`milestone-tag ${tag === 'Super 10' ? 'super-ten' : 'high-five'}`}>{tag}</span>)}</span>}</span>
        <b>{pts(row.best!.value, row.unit)}</b>
      </div>)}
    </div>}
  </section>;
}
