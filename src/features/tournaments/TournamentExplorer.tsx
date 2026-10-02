import { useEffect, useState } from 'react';
import { api, type AccountSession } from '../identity/data/auth-client';
import { TournamentDashboard } from './TournamentDashboard';
import { MatchActions } from '../scorecard/MatchActions';
import type { LocalMatch } from '../scoring/domain/match-types';
import type { PreparedFixture } from './types';
import type { TournamentListItem } from './data/upcoming-fixtures';
import { RequestToJoin } from './RequestToJoin';
import type { Focus } from '../notifications/notification-client';

export interface PublicTournamentDetail {
  tournament: TournamentListItem;
  teams: { id: string; name: string; players: string[] }[];
  fixtures: { id: string; teamAId: string; teamBId: string; scheduledAt: string | null; matchId: string | null; status: string | null; scoreA: number | null; scoreB: number | null }[];
  standings: { teamId: string; teamName: string; rank: number; tablePoints: number; scoreDifference: number }[];
  registrationOpen?: boolean;
}

export function TournamentExplorer({ account, online, matches, onPrepareFixture, onScoreMatch, focus = null }: {
  account: AccountSession | null; online: boolean; matches: LocalMatch[]; onPrepareFixture: (fixture: PreparedFixture) => void;
  onScoreMatch?: (id: string) => void; focus?: Focus | null;
}) {
  const [mine, setMine] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<TournamentListItem[]>([]);
  const [joined, setJoined] = useState<string[]>([]);
  const [own, setOwn] = useState<string[]>([]);
  const [detail, setDetail] = useState<PublicTournamentDetail | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [detailTab, setDetailTab] = useState<'teams' | 'matches' | 'standings'>('teams');
  useEffect(() => { setMine(false); setDetail(null); }, [account?.accountId]);
  // A tapped notification opens the organizer's own view of that tournament.
  useEffect(() => { if (focus?.tournamentId && account) { setCreating(false); setMine(true); setDetail(null); } }, [focus?.nonce, focus?.tournamentId, account]);
  useEffect(() => {
    let active = true;
    if (!online) { setMessage('Reconnect to browse tournaments.'); return; }
    setMessage('Loading tournaments…');
    void api<TournamentListItem[]>(`/public/tournaments?search=${encodeURIComponent(query)}`)
      .then((value) => { if (active) { setItems(value); setMessage(''); } })
      .catch(() => { if (active) setMessage('Could not load tournaments. Please try again.'); });
    return () => { active = false; };
  }, [query, online]);
  useEffect(() => {
    let active = true;
    setJoined([]);
    setOwn([]);
    if (account && online) {
      void api<string[]>('/account/joined-tournaments', undefined, account.token)
        .then((value) => { if (active) setJoined(value); }).catch(() => undefined);
      // Tournaments this account organizes: managed from My tournaments, not joined or requested.
      void api<{ id: string }[]>('/tournaments', undefined, account.token)
        .then((value) => { if (active) setOwn(value.map((item) => item.id)); }).catch(() => undefined);
    }
    return () => { active = false; };
  }, [account?.accountId, account?.token, online, mine]);
  async function open(id: string) {
    setDetailTab('teams');
    setBusy(true); setMessage('');
    try {
      const [result, mineNow] = await Promise.all([
        api<PublicTournamentDetail>(`/public/tournaments/${id}`),
        account ? api<{ id: string }[]>('/tournaments', undefined, account.token).catch(() => null) : Promise.resolve(null),
      ]);
      if (mineNow) setOwn(mineNow.map((item) => item.id));
      setDetail(result);
    }
    catch { setMessage('Could not load tournament details.'); }
    finally { setBusy(false); }
  }
  async function join(id: string) {
    if (!account) { setMessage('Sign in with your phone below to join this tournament.'); return; }
    setBusy(true);
    try {
      await api(`/tournaments/${id}/join`, {}, account.token);
      setJoined((current) => [...new Set([...current, id])]);
      setMessage('Joined. Its fixtures and scores now appear in Matches.');
    } catch { setMessage('Could not join. Please reconnect and try again.'); }
    finally { setBusy(false); }
  }
  const teamName = (id: string) => detail?.teams.find((team) => team.id === id)?.name ?? 'Team';
  return <section className="tournament-screen" aria-label="Browse tournaments">
    <div className="list-filter-tabs">
      <button className={!mine ? 'active' : ''} onClick={() => { setMine(false); setDetail(null); }}>Explore tournaments</button>
      {account && <button className={mine ? 'active' : ''} onClick={() => { setCreating(false); setMine(true); }}>My tournaments</button>}
    </div>
    {mine && account ? <TournamentDashboard account={account} online={online} matches={matches} onPrepareFixture={onPrepareFixture} onScoreMatch={onScoreMatch} startCreating={creating} focus={focus} /> : <>
      {!detail ? <>
        <header className="list-screen-heading"><h2>Tournaments</h2><p>Find competitions, follow teams, and catch every score.</p></header>
        <form className="tournament-search" onSubmit={(event) => { event.preventDefault(); setQuery(search.trim()); }}>
          <label><span className="sr-only">Search tournaments</span><input type="search" value={search} maxLength={100} onChange={(event) => setSearch(event.target.value)} placeholder="Tournament name or venue" /></label>
          <button type="submit" disabled={!online}>Search</button>
        </form>
        <div className="tournament-list">{items.map((item) => <button className="tournament-list-card" key={item.id} disabled={!online || busy} onClick={() => void open(item.id)}>
          <span className="tournament-card-top"><strong>{item.name}</strong>{own.includes(item.id) ? <em>ORGANIZER</em> : joined.includes(item.id) && <em>JOINED</em>}</span>
          <span className="tournament-card-venue">{item.venue}</span><span className="tournament-card-date">{item.startsOn}</span>
        </button>)}</div>
        {!message && items.length === 0 && <p className="list-empty">No tournaments found.</p>}
      </> : <>
        <header className="tournament-detail-header"><button className="tournament-back" onClick={() => setDetail(null)} aria-label="Back to tournament search">←</button><div><h2>{detail.tournament.name}</h2><p>{detail.tournament.venue} · {detail.tournament.startsOn}</p></div>
          {own.includes(detail.tournament.id)
            ? <button className="tournament-join-inline" onClick={() => { setCreating(false); setMine(true); setDetail(null); }}>Manage</button>
            : <button className={`tournament-join-inline ${joined.includes(detail.tournament.id) ? 'joined' : ''}`} disabled={busy || !online || joined.includes(detail.tournament.id)} onClick={() => void join(detail.tournament.id)}>{joined.includes(detail.tournament.id) ? '✓ Joined' : 'Join'}</button>}
        </header>
        {own.includes(detail.tournament.id)
          ? <p className="muted">You organize this tournament. Manage teams, fixtures and scoring from My tournaments.</p>
          : <>
            <p className="muted">Join to follow matches. Only the organizer can manage and score them.</p>
            <RequestToJoin account={account} online={online} tournamentId={detail.tournament.id} registrationOpen={detail.registrationOpen !== false} />
          </>}
        <div className="list-filter-tabs" role="tablist" aria-label="Tournament information">{(['teams', 'matches', 'standings'] as const).map((tab) => <button key={tab} role="tab" aria-selected={detailTab === tab} className={detailTab === tab ? 'active' : ''} onClick={() => setDetailTab(tab)}>{tab[0].toUpperCase() + tab.slice(1)}</button>)}</div>
        {detailTab === 'teams' && <><h3>Teams</h3><ul className="tournament-team-list">{detail.teams.map((team, index) => <li key={team.id}><span className={`tournament-team-mark side-${index % 2}`} aria-hidden="true">{team.name.slice(0, 2).toUpperCase()}</span><span className="tournament-team-text"><strong>{team.name}</strong><small>{team.players.length ? `${team.players.length} player${team.players.length === 1 ? '' : 's'}` : 'Squad not added yet'}</small></span></li>)}</ul></>}
        {detailTab === 'matches' && <>
        <h3>Matches</h3>{detail.fixtures.map((fixture) => <article className="upcoming-match-card" key={fixture.id}><strong>{teamName(fixture.teamAId)} vs {teamName(fixture.teamBId)}</strong><p>{fixture.status ? `${fixture.scoreA ?? 0} : ${fixture.scoreB ?? 0} · ${fixture.status.replaceAll('_', ' ')}` : 'Upcoming'}</p><small>{fixture.scheduledAt ? new Date(fixture.scheduledAt).toLocaleString() : 'Time to be confirmed'}</small>{fixture.matchId && <MatchActions matchId={fixture.matchId} matches={matches} onScore={onScoreMatch} completed={fixture.status === 'COMPLETED'} />}</article>)}
        {!detail.fixtures.length && <p>No fixtures yet.</p>}
        </>}
        {detailTab === 'standings' && <>
        <h3>Standings</h3>{detail.standings.map((row) => <div className="tournament-player-row" key={row.teamId}><strong>{row.rank}. {row.teamName}</strong><small>{row.tablePoints} pts · {row.scoreDifference > 0 ? '+' : ''}{row.scoreDifference}</small></div>)}
        </>}
      </>}
      {message && <p role="status">{message}</p>}
    </>}
  </section>;
}
