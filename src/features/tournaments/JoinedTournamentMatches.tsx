import { useEffect, useState } from 'react';
import { api } from '../identity/data/auth-client';
import { restoreSession } from '../identity/data/session-store';
import type { PublicTournamentDetail } from './TournamentExplorer';
import { MatchActions } from '../scorecard/MatchActions';
import type { LocalMatch } from '../scoring/domain/match-types';

/** Public details of every tournament the signed-in account joined (follows); refreshed every 30 s. */
export function useJoinedTournaments(online: boolean) {
  const [details, setDetails] = useState<PublicTournamentDetail[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    async function refresh() {
      if (!online) { if (active) setError('Reconnect to refresh joined tournament scores.'); return; }
      try {
        const account = await restoreSession();
        if (!account) { if (active) setDetails([]); return; }
        const joined = await api<string[]>('/account/joined-tournaments', undefined, account.token);
        const loaded = await Promise.all(joined.map((id) => api<PublicTournamentDetail>(`/public/tournaments/${id}`)));
        if (active) { setDetails(loaded); setError(''); }
      } catch { if (active) setError('Could not refresh joined tournament matches.'); }
    }
    void refresh();
    const interval = setInterval(() => void refresh(), 30000);
    return () => { active = false; clearInterval(interval); };
  }, [online]);
  return { details, error };
}

export function JoinedTournamentMatches({ filter, online, matches, onScoreMatch }: { filter: 'UPCOMING' | 'LIVE' | 'COMPLETED'; online: boolean; matches: LocalMatch[]; onScoreMatch: (id: string) => void }) {
  const { details, error } = useJoinedTournaments(online);
  const fixtures = details.flatMap((detail) => detail.fixtures.filter((fixture) =>
    filter === 'UPCOMING' ? !fixture.matchId : filter === 'COMPLETED' ? fixture.status === 'COMPLETED' : !!fixture.matchId && fixture.status !== 'COMPLETED'
  ).map((fixture) => ({ ...fixture, tournament: detail.tournament.name, teams: detail.teams })));
  if (!details.length && !error) return null;
  return <section className="joined-matches" aria-label="Joined tournament matches">
    <h3>Joined tournaments</h3>
    {error && <p role="status">{error}</p>}
    {fixtures.map((fixture) => <article className="upcoming-match-card" key={fixture.id}>
      <small>{fixture.tournament} · View only</small>
      <div className="upcoming-teams"><strong>{fixture.teams.find((team) => team.id === fixture.teamAId)?.name ?? fixture.labelA ?? 'To be decided'}</strong><span>{fixture.matchId ? `${fixture.scoreA ?? 0} : ${fixture.scoreB ?? 0}` : 'vs'}</span><strong>{fixture.teams.find((team) => team.id === fixture.teamBId)?.name ?? fixture.labelB ?? 'To be decided'}</strong></div>
      <p>{fixture.status?.replaceAll('_', ' ') ?? 'Upcoming'} · {fixture.scheduledAt ? new Date(fixture.scheduledAt).toLocaleString() : 'Time to be confirmed'}</p>
      {fixture.matchId && <MatchActions matchId={fixture.matchId} matches={matches} onScore={onScoreMatch} completed={fixture.status === 'COMPLETED'} />}
    </article>)}
    {fixtures.length === 0 && <p>No {filter.toLowerCase()} matches in your joined tournaments.</p>}
  </section>;
}
