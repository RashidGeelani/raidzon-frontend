import { useEffect, useRef, useState } from 'react';
import { api } from '../identity/data/api';
import { HIGHLIGHT_TITLES, popFor, type Highlight } from '../scoring/domain/highlights';
import { isDoOrDie } from '../scoring/domain/match-types';
import { withJersey } from '../scoring/domain/jersey';
import { useLiveView } from '../scorecard/use-live-view';
import { clockRemaining, winnerSide, type LiveView, type ViewerState } from '../scorecard/viewer-state';
import { clockText, matCount, MAT_SIZE, overlayPhase, teamCode, type OverlayPhase } from './overlay-model';

/**
 * Broadcast score bar at /overlay/:matchId, Pro Kabaddi style: team codes in team colours, players
 * on mat as dots, score, half clock, the raider with the 30-second raid clock, and pop-ups for big
 * moments. The page background is transparent so streaming software lays it over the video.
 * Sized in vw, so it fits any Browser Source size (1920×1080 recommended).
 */
export function OverlayPage({ matchId, delayMs }: { matchId: string; delayMs: number }) {
  const { view, now, unavailable } = useLiveView(matchId, delayMs);
  const tournament = useTournamentName(view?.tournamentId);
  if (!view) return <div className="overlay-root">{unavailable && <p className="overlay-notice">This match is not available. Check the overlay link.</p>}</div>;
  const state = view.state;
  const phase = overlayPhase(state, view.events.length);
  const scores = state.phase === 'REGULATION' ? state.scores : state.tieScores;
  const raider = state.teams[state.turn]?.players.find((player) => player.id === state.currentRaiderId);
  const raidSeconds = Math.ceil(clockRemaining(state.raidClock, now) / 1000);
  const halfSeconds = Math.ceil(clockRemaining(state.clock, now) / 1000);
  return (
    <div className="overlay-root" data-phase={phase}>
      <div className="overlay-dock">
        {phase === 'final' && <ResultCard state={state} scores={scores} />}
        <Popups event={view.events[0]} teams={state.teams.map((team) => team.name)} />
        {phase === 'live' && raider && (
          <div key={raider.id} className={`overlay-raider overlay-side-${state.turn}`} role="status">
            <span className={`overlay-raider-label ${isDoOrDie(state) ? 'do-or-die' : ''}`}>{isDoOrDie(state) ? 'DO OR DIE' : 'RAID'}</span>
            <strong>{withJersey(raider)}</strong>
            <span className={`overlay-raid-clock ${raidSeconds <= 10 ? 'warning' : ''}`} aria-label="Raid time remaining">{raidSeconds}</span>
          </div>
        )}
        {tournament && <p className="overlay-tournament">{tournament}</p>}
        <div className="overlay-bar">
          <span className="overlay-brand">raidz<b>On</b></span>
          <OverlayTeam team={state.teams[0]} side={0} raiding={phase === 'live' && state.turn === 0} />
          <span className="overlay-score overlay-side-0">{scores[0]}</span>
          <Centre phase={phase} state={state} halfSeconds={halfSeconds} />
          <span className="overlay-score overlay-side-1">{scores[1]}</span>
          <OverlayTeam team={state.teams[1]} side={1} raiding={phase === 'live' && state.turn === 1} />
        </div>
      </div>
    </div>
  );
}

function useTournamentName(tournamentId: string | null | undefined) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    if (!tournamentId) return;
    let active = true;
    api<{ tournament: { name: string } }>(`/public/tournaments/${encodeURIComponent(tournamentId)}`)
      .then((result) => { if (active) setName(result.tournament.name); })
      .catch(() => { /* the bar works without the tournament name */ });
    return () => { active = false; };
  }, [tournamentId]);
  return name;
}

function OverlayTeam({ team, side, raiding }: { team: ViewerState['teams'][number]; side: 0 | 1; raiding: boolean }) {
  const onMat = matCount(team.players);
  return (
    <div className={`overlay-team overlay-side-${side} ${raiding ? 'raiding' : ''}`}>
      <strong title={team.name}>{teamCode(team.name)}</strong>
      <span className="overlay-dots" aria-label={`${onMat} players on mat`}>
        {Array.from({ length: MAT_SIZE }, (_, index) => <i key={index} className={index < onMat ? 'on' : ''} />)}
      </span>
    </div>
  );
}

function Centre({ phase, state, halfSeconds }: { phase: OverlayPhase; state: ViewerState; halfSeconds: number }) {
  if (phase === 'starting') return <span className="overlay-centre"><b>STARTING</b><small>SOON</small></span>;
  if (phase === 'final') return <span className="overlay-centre"><b>FULL</b><small>TIME</small></span>;
  if (phase === 'break') return <span className="overlay-centre"><b>{state.status === 'HALF_TIME' ? 'HALF' : 'PAUSED'}</b><small>{state.status === 'HALF_TIME' ? 'TIME' : clockText(halfSeconds)}</small></span>;
  if (state.phase !== 'REGULATION') return <span className="overlay-centre"><b>{state.phase === 'TIE_BREAK' ? 'TIE' : 'GOLDEN'}</b><small>{state.phase === 'TIE_BREAK' ? 'BREAK' : 'RAID'}</small></span>;
  return <span className="overlay-centre"><b>{clockText(halfSeconds)}</b><small>{state.half === 1 ? '1ST HALF' : '2ND HALF'}</small></span>;
}

/** Super Raid, Super Tackle, All Out and technical points, once each, for a few seconds. */
function Popups({ event, teams }: { event?: LiveView['events'][number]; teams: string[] }) {
  const seen = useRef<{ ids?: Set<string> }>({});
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [shown, setShown] = useState<Highlight[]>([]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!event) return;
    const found = popFor(seen.current, event);
    if (!found.length) return;
    clearTimeout(timer.current);
    setShown(found);
    timer.current = setTimeout(() => setShown([]), 4000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id]);
  return (
    <div className="overlay-popups" role="status" aria-live="polite">
      {shown.map((highlight) => (
        <div key={highlight.kind} className={`overlay-popup overlay-side-${highlight.side}`}>
          <strong>{HIGHLIGHT_TITLES[highlight.kind]}</strong>
          <span>{teams[highlight.side]}</span>
        </div>
      ))}
    </div>
  );
}

function ResultCard({ state, scores }: { state: ViewerState; scores: number[] }) {
  const winner = winnerSide(state.winner);
  const margin = Math.abs(scores[0] - scores[1]);
  const headline = winner === 'DRAW' || winner === null ? 'Match drawn' : `${state.teams[winner]?.name ?? 'Winner'} win${margin ? ` by ${margin} point${margin === 1 ? '' : 's'}` : ' on the tie-break'}`;
  return (
    <div className="overlay-result" role="status">
      <small>FULL TIME</small>
      <p>
        <span>{state.teams[0].name}</span>
        <b>{scores[0]} – {scores[1]}</b>
        <span>{state.teams[1].name}</span>
      </p>
      <strong>{headline}</strong>
    </div>
  );
}
