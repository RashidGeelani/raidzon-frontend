import { useEffect, useState } from 'react';
import { api, ApiError } from '../identity/data/api';
import { setPageMeta, tournamentJsonLd } from '../../app/page-meta';
import { TournamentLeaders } from '../scoring/components/SyncedLeaderboards';
import { BracketView, GroupTables, StagedFixtures } from '../tournaments/FormatViews';
import { FORMAT_LABELS, sideName } from '../tournaments/data/format-types';
import type { PublicTournamentDetail } from '../tournaments/TournamentExplorer';

/** Signed-out tournament page at /tournaments/:id: overview, points table, fixtures and results, bracket, leaders, teams. */
export function PublicTournamentPage({ tournamentId }: { tournamentId: string }) {
  const [detail, setDetail] = useState<PublicTournamentDetail | null>(null);
  const [message, setMessage] = useState('Loading tournament…');
  useEffect(() => {
    let active = true;
    api<PublicTournamentDetail>(`/public/tournaments/${encodeURIComponent(tournamentId)}`)
      .then((result) => {
        if (!active) return;
        setDetail(result);
        setMessage('');
        const { name, venue, startsOn } = result.tournament;
        const leader = result.standings[0];
        setPageMeta(
          `${name} · Kabaddi points table, fixtures & results · RaidzOn`,
          `${name} kabaddi tournament at ${venue} from ${startsOn}: ${result.teams.length} teams, fixtures, live scores, results and points table${leader ? ` (${leader.teamName} top with ${leader.tablePoints} points)` : ''}.`,
          tournamentJsonLd(name, venue, startsOn, result.teams.map((team) => team.name), window.location.href),
        );
      })
      .catch((error) => {
        if (active) setMessage(error instanceof ApiError && error.status === 404 ? 'This tournament is not available.' : 'Could not load the tournament. Please try again.');
      });
    return () => { active = false; };
  }, [tournamentId]);
  const teamName = (id: string) => detail?.teams.find((team) => team.id === id)?.name ?? 'Team';
  return (
    <main className="info-page public-tournament">
      <header className="info-page-header">
        <a className="tournament-back" href="/" aria-label="Open raidzOn">←</a>
        <span className="info-page-brand">raidzOn</span>
      </header>
      {message && <p role="status">{message}</p>}
      {detail && <>
        <section className="info-hero">
          <p className="eyebrow">KABADDI TOURNAMENT{detail.format ? ` · ${FORMAT_LABELS[detail.format.type].toUpperCase()}` : ''}</p>
          <h1>{detail.tournament.name}</h1>
          <p>{detail.tournament.venue} · {detail.tournament.startsOn} · {detail.teams.length} teams</p>
        </section>
        {detail.championId && <div className="champion-banner"><span aria-hidden="true">🏆</span><div><small>CHAMPIONS</small><strong>{teamName(detail.championId)}</strong></div></div>}
        {detail.format?.type !== 'KNOCKOUT' && <section className="info-section" aria-label="Points table"><GroupTables standings={detail.standings} groups={detail.groups ?? []} format={detail.format} /></section>}
        <section className="info-section">
          <h2>Fixtures & results</h2>
          <StagedFixtures fixtures={detail.fixtures} groups={detail.groups ?? []} renderFixture={(fixture) => <article className="upcoming-match-card">
            {fixture.roundName && <small className="fixture-stage">{fixture.roundName}</small>}
            <strong>{sideName(fixture, 'A', teamName)} vs {sideName(fixture, 'B', teamName)}</strong>
            <p>{fixture.status ? `${fixture.scoreA ?? 0} : ${fixture.scoreB ?? 0} · ${fixture.status.replaceAll('_', ' ')}` : 'Upcoming'}</p>
            <small>{fixture.scheduledAt ? new Date(fixture.scheduledAt).toLocaleString() : 'Time to be confirmed'}</small>
            {fixture.matchId && <a href={`/watch/${fixture.matchId}`}>{fixture.status === 'COMPLETED' ? 'Match details' : 'Watch live'} ›</a>}
          </article>} />
          {!detail.fixtures.length && <p>No fixtures yet.</p>}
        </section>
        {detail.format && detail.format.type !== 'LEAGUE' && <section className="info-section"><h2>Bracket</h2><BracketView fixtures={detail.fixtures} teamName={teamName} championId={detail.championId} /></section>}
        <section className="info-section"><h2>Top players</h2><TournamentLeaders tournamentId={tournamentId} online linkPlayers /></section>
        <section className="info-section">
          <h2>Teams</h2>
          {!detail.teams.length && <p>No teams yet.</p>}
          <ul className="tournament-team-list">{detail.teams.map((team) => <li key={team.id}><span className="tournament-team-text"><strong>{team.name}</strong><small>{team.players.length ? team.players.join(', ') : 'Squad not added yet'}</small></span></li>)}</ul>
        </section>
      </>}
      <footer className="info-page-footer"><a href="/">Score kabaddi on raidzOn</a><a href="/help">Help & Support</a></footer>
    </main>
  );
}
