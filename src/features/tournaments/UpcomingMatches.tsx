import { useEffect, useState } from 'react';
import { api } from '../identity/data/auth-client';
import { restoreSession } from '../identity/data/session-store';
import { db } from '../matches/data/match-repository';
import type { LocalMatch } from '../scoring/domain/match-types';
import type { PreparedFixture } from './types';
import { collectUpcomingFixtures, type TournamentFixtureDetail, type TournamentListItem } from './data/upcoming-fixtures';

export function UpcomingMatches({ matches, online, onPrepare, limit, quiet = false }: {
  matches: LocalMatch[];
  online: boolean;
  onPrepare: (fixture: PreparedFixture) => void;
  /** Show only the first N fixtures (Home shows the next one). */
  limit?: number;
  /** Hide status messages and the empty state; render nothing when there is no fixture. */
  quiet?: boolean;
}) {
  const [details, setDetails] = useState<TournamentFixtureDetail[]>([]);
  const [message, setMessage] = useState('Loading scheduled matches…');
  useEffect(() => {
    let active = true;
    void (async () => {
      const account = await restoreSession();
      if (!active) return;
      if (!account) {
        setDetails([]);
        setMessage('Sign in to see tournament fixtures. You can still start a match offline.');
        return;
      }
      const cacheKey = `upcoming-fixtures:${account.accountId}`;
      const cached = await db.metadata.get(cacheKey);
      if (cached && active) {
        try { setDetails(JSON.parse(cached.value) as TournamentFixtureDetail[]); } catch { /* Refresh below. */ }
      }
      if (!online) {
        if (active) setMessage(cached ? 'Showing the last saved fixture list. You can prepare a match offline.' : 'Reconnect once to load your tournament fixtures.');
        return;
      }
      try {
        const tournaments = await api<TournamentListItem[]>('/tournaments', undefined, account.token);
        const loaded = await Promise.all(tournaments.map((item) =>
          api<TournamentFixtureDetail>(`/tournaments/${item.id}`, undefined, account.token)));
        await db.metadata.put({ key: cacheKey, value: JSON.stringify(loaded) });
        if (active) {
          setDetails(loaded);
          setMessage('');
        }
      } catch {
        if (active) setMessage('Could not refresh fixtures. Showing the last saved list, if available.');
      }
    })();
    return () => { active = false; };
  }, [online]);
  const fixtures = collectUpcomingFixtures(details, matches).slice(0, limit ?? Infinity);
  if (quiet && fixtures.length === 0) return null;
  return <div className="upcoming-match-list">
    {message && !quiet && <p className="fixture-load-message" role="status">{message}</p>}
    {fixtures.map((fixture) => <article className="upcoming-match-card" key={fixture.id}>
      <small>{fixture.tournamentName} · {fixture.venue}</small>
      <div className="upcoming-teams"><strong>{fixture.prepared.teamA}</strong><span>vs</span><strong>{fixture.prepared.teamB}</strong></div>
      <p>{fixture.scheduledAt ? new Date(fixture.scheduledAt).toLocaleString() : 'Time to be confirmed'}</p>
      <button type="button" onClick={() => onPrepare(fixture.prepared)}>Prepare match →</button>
    </article>)}
    {!message && !quiet && fixtures.length === 0 && <div className="list-empty">No upcoming fixtures. Schedule one in a tournament, or start a match now.</div>}
  </div>;
}
