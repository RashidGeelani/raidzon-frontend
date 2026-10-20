import { useEffect, useState } from 'react';
import { Tabs } from '../../ui/Tabs';
import { requestInstallNudge } from '../../app/install';
import { eventLabel, raidDetail } from '../scoring/domain/event-label';
import { milestones } from '../scoring/domain/match-summary';
import { isDoOrDie } from '../scoring/domain/match-types';
import { withJersey } from '../scoring/domain/jersey';
import { watchMatch, type LiveConnection, type LiveStateUpdate } from './live-socket';
import { ReportMatch } from './ReportMatch';
import type { ClockState, MatchState, Player, ScoreComponent } from '../scoring/domain/match-types';
import { HighlightToast } from '../scoring/components/HighlightToast';
import { CourtDrawers } from '../scoring/components/CourtDrawers';
import { matchJsonLd, setPageMeta } from '../../app/page-meta';

type ViewerState = Pick<MatchState, 'scores' | 'tieScores' | 'status' | 'phase' | 'half' | 'raidNumber' | 'turn' | 'currentRaiderId' | 'clock' | 'raidClock' | 'winner'> & {
  /** queue: revival order (player IDs); absent from servers older than the viewer's out queue. */
  teams: { name: string; players: Omit<Player, 'phone'>[]; queue?: string[] }[];
};
interface LiveView { state: ViewerState; serverTime: number; lastSyncedAt: number; version: number; /** Server clock minus the scoring phone's clock (ms). */ clockOffset?: number; tournamentId?: string | null; /** Absent from older servers. */ startedAt?: number | null; venue?: string | null; events: { id: string; summary: string; raidNumber: number; type: string; components?: ScoreComponent[] | null; /** Defenders put out (absent from older servers). */ touchedIds?: string[] | null; selfOutIds?: string[] | null }[] }
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
  const [teamA, teamB] = [state?.teams[0]?.name, state?.teams[1]?.name];
  const status = state?.status;
  useEffect(() => {
    if (onBack || !teamA || !teamB || !status) return; // in-app viewer keeps the app's title
    const live = status === 'COMPLETED' ? 'result' : 'live score';
    setPageMeta(`${teamA} vs ${teamB} ${live} · Kabaddi · RaidzOn`, `Follow ${teamA} vs ${teamB} kabaddi ${live} raid by raid on RaidzOn: score, current raider, top raiders and match events.`, matchJsonLd(teamA, teamB, status, window.location.href, view?.startedAt, view?.venue));
  }, [onBack, teamA, teamB, status, view?.startedAt, view?.venue]);
  // Match clocks are in the scoring phone's time: shift server time by that phone's clock error.
  const now = anchor.server - (view?.clockOffset ?? 0) + Math.max(0, tick - anchor.local);
  const raider = state?.teams[state.turn]?.players.find((player) => player.id === state.currentRaiderId);
  const raidSeconds = state ? Math.ceil(clockRemaining(state.raidClock, now) / 1000) : 0;
  const halfSeconds = state ? Math.ceil(clockRemaining(state.clock, now) / 1000) : 0;
  const completed = state?.status === 'COMPLETED';
  const lastRaid = view?.events.find((event) => event.type === 'RAID');
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
  return <section className={`live-match-view ${state && !completed ? 'with-drawers' : ''}`} aria-label="Live match viewer">
    <header className="live-view-header">
      {onBack ? <button className="tournament-back" onClick={onBack} aria-label="Back to matches">←</button> : <a href="/" onClick={(event) => { if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) { event.preventDefault(); window.history.back(); } }}>← Back</a>}
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
      <HighlightToast key={matchId} event={view.events[0]} teams={state.teams.map((team) => team.name)} />
      {isDoOrDie(state) && (state.status === 'LIVE' || state.status === 'PAUSED') && <div className="viewer-do-or-die" role="status"><strong>DO-OR-DIE RAID</strong><span>{state.teams[state.turn]?.name} must score or the raider is out</span></div>}
      <div className="live-current-raider"><div><strong>{raider ? withJersey(raider) : (state.status === 'COMPLETED' ? 'Match complete' : 'Waiting for the next raider')}</strong><small>{state.teams[state.turn].name} · Raid #{state.raidNumber}</small></div><span className={`live-countdown ${raidSeconds === 0 ? 'expired' : raider && raidSeconds <= 10 ? 'warning' : ''}`} aria-label="Raid time remaining">{raider ? raidSeconds : '—'}<small>seconds</small></span></div>
      {raider && raidSeconds === 0 && <p className="field-note">Time elapsed — waiting for the scorer’s decision.</p>}
      {lastRaid && <LastRaid key={lastRaid.id} event={lastRaid} state={state} />}
      <CourtDrawers teams={state.teams.map((team) => ({ ...team, queue: team.queue ?? team.players.filter((player) => player.status === 'OUT').map((player) => player.id) }))} currentRaiderId={state.currentRaiderId} />
      </>}
      <h3 className="live-section-title">Match events</h3>
      <MatchEvents events={view!.events} state={state} />
      <h3 className="live-section-title">Team scorecards</h3>
      <PlayerScorecards state={state} events={view!.events} />
      {!onBack && view?.tournamentId && <p><a href={`/tournaments/${view.tournamentId}`}>Tournament fixtures, points table and top players ›</a></p>}
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
        <span className="result-standout-text"><small>{row.label}</small><strong>{row.best!.player.name}</strong><em>{row.best!.team}</em>{milestones(row.best!.player).length > 0 && <span className="milestone-tags"><MilestoneTags player={row.best!.player} /></span>}</span>
        <b>{pts(row.best!.value, row.unit)}</b>
      </div>)}
    </div>}
  </section>;
}

const MilestoneTags = ({ player }: { player: ViewerPlayer }) => <>{milestones(player).map((tag) => <span key={tag} className={`milestone-tag ${tag === 'Super 10' ? 'super-ten' : 'high-five'}`}>{tag}</span>)}</>;

/** "Tigers +2 · Lions +1" for an event's points; empty when nobody scored. */
export function eventPoints(components: ScoreComponent[] | null | undefined, teams: { name: string }[]) {
  return [0, 1].map((side) => ({ side, points: (components ?? []).filter((c) => c.side === side).reduce((total, c) => total + c.points, 0) }))
    .filter((row) => row.points > 0).map((row) => `${teams[row.side]?.name} +${row.points}`).join(' · ');
}

type ViewerEvent = LiveView['events'][number];
/** Raids in full ("tackled by Jafar"); other events by their usual label. */
function describe(event: ViewerEvent, state: ViewerState) {
  if (event.type !== 'RAID') return eventLabel(event.summary);
  const players = state.teams.flatMap((team) => team.players);
  return raidDetail(event.summary, event.components, (id) => players.find((player) => player.id === id)?.name, event);
}

/** The latest raid's result, under the current raid. Keyed by event, so it flashes on each new raid. */
function LastRaid({ event, state }: { event: ViewerEvent; state: ViewerState }) {
  const detail = describe(event, state);
  const tone = /unsuccessful|self-out|Do-or-Die failed/.test(detail) ? 'fail' : /successful raid/.test(detail) ? 'success' : '';
  return <div className={`viewer-last-raid ${tone}`} role="status" aria-live="polite">
    <small>Last raid · R{event.raidNumber}</small>
    <strong>{detail}</strong>
    {eventPoints(event.components, state.teams) && <em>{eventPoints(event.components, state.teams)}</em>}
  </div>;
}

/** Every event, newest first, numbered like the scorer's timeline; "Raids" hides half-time, pauses and substitutions. */
function MatchEvents({ events, state }: { events: ViewerEvent[]; state: ViewerState }) {
  const [filter, setFilter] = useState<'all' | 'raids'>('all');
  const shown = events.map((event, index) => ({ event, number: events.length - index })).filter(({ event }) => filter === 'all' || event.type === 'RAID');
  return <div className="live-court-team viewer-events">
    <Tabs label="Match events" value={filter} onChange={setFilter} items={[{ value: 'all', label: 'All events' }, { value: 'raids', label: 'Raids only' }]} />
    {shown.length === 0 ? <p>No {filter === 'raids' ? 'raids' : 'events'} yet.</p> : <ol className="timeline">{shown.map(({ event, number }) => <li key={event.id}>
      <span className="event-number">{String(number).padStart(2, '0')}</span>
      <div><strong>{describe(event, state)}</strong><small>Raid {event.raidNumber}{eventPoints(event.components, state.teams) && ` · ${eventPoints(event.components, state.teams)}`}</small></div>
    </li>)}</ol>}
  </div>;
}

/** A team's points by kind and its successful raids, from the event list. */
export function teamTotals(events: Pick<ViewerEvent, 'type' | 'components'>[], side: number) {
  const parts = events.flatMap((event) => event.components ?? []).filter((c) => c.side === side);
  const sum = (...kinds: string[]) => parts.filter((c) => kinds.includes(c.kind)).reduce((total, c) => total + c.points, 0);
  return {
    raid: sum('TOUCH', 'BONUS'),
    tackle: sum('TACKLE', 'SUPER_TACKLE_EXTRA'),
    allOut: sum('ALL_OUT'),
    extras: sum('SELF_OUT', 'TECHNICAL'),
    successfulRaids: events.filter((event) => event.type === 'RAID' && (event.components ?? []).some((c) => c.side === side && (c.kind === 'TOUCH' || c.kind === 'BONUS'))).length,
  };
}

/** One team's players at a time (tabs), top scorers first, with High 5 / Super 10 tags after the name. */
function PlayerScorecards({ state, events }: { state: ViewerState; events: ViewerEvent[] }) {
  const [side, setSide] = useState('0');
  const team = state.teams[Number(side)];
  const totals = teamTotals(events, Number(side));
  const live = state.status !== 'COMPLETED';
  const total = (player: ViewerPlayer) => player.raidPoints + player.tacklePoints;
  return <div className="live-court-team viewer-scorecard">
    <Tabs label="Team scorecards" value={side} onChange={setSide} items={state.teams.map((item, index) => ({ value: String(index), label: item.name }))} />
    <table>
      <thead><tr><th scope="col">Player</th><th scope="col">Raid</th><th scope="col">Tackle</th><th scope="col">Total</th></tr></thead>
      <tbody>{[...team.players].sort((a, b) => total(b) - total(a)).map((player) => <tr key={player.id}>
        <th scope="row">{withJersey(player)} <MilestoneTags player={player} />{live && player.status !== 'ACTIVE' && <span className="viewer-player-status">{player.status === 'BENCH' ? 'bench' : 'out'}</span>}</th>
        <td>{player.raidPoints}</td><td>{player.tacklePoints}</td><td><b>{total(player)}</b></td>
      </tr>)}</tbody>
    </table>
    <dl className="viewer-team-totals">
      {[['Raid points', totals.raid], ['Tackle points', totals.tackle], ['All out', totals.allOut], ['Extras', totals.extras], ['Successful raids', totals.successfulRaids]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
  </div>;
}
