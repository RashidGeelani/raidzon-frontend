import { useEffect, useRef, useState } from 'react';
import { api, type AccountSession } from '../identity/data/auth-client';
import type { LocalMatch } from '../scoring/domain/match-types';
import type { PreparedFixture } from './types';
import { normalizePhone } from '../matches/data/match-repository';

interface Tournament {
  id: string;
  name: string;
  venue: string;
  startsOn: string;
  halfMinutes: number;
  raidSeconds: number;
}
interface Team {
  id: string;
  name: string;
  rosterRevision: number;
  roster: { name: string; phone: string }[];
}
interface Fixture {
  id: string;
  teamAId: string;
  teamBId: string;
  scheduledAt: string | null;
  matchId: string | null;
  status: string | null;
  scoreA: number | null;
  scoreB: number | null;
  phase: string | null;
  tieScoreA: number | null;
  tieScoreB: number | null;
  winner: string | null;
  scheduleRevision: number;
}
interface Detail {
  tournament: Tournament;
  teams: Team[];
  fixtures: Fixture[];
  standings: {
    teamId: string;
    teamName: string;
    rank: number;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    tablePoints: number;
    pointsFor: number;
    pointsAgainst: number;
    scoreDifference: number;
  }[];
}
type TournamentFilter = 'ACTIVE' | 'UPCOMING' | 'COMPLETED';
type TournamentSummary = { teams: number; matches: number; status: TournamentFilter };
type DetailTab = 'overview' | 'teams' | 'matches' | 'standings' | 'players';
export function TournamentDashboard({
  account,
  online,
  matches,
  onPrepareFixture,
}: {
  account: AccountSession;
  online: boolean;
  matches: LocalMatch[];
  onPrepareFixture: (fixture: PreparedFixture) => void;
}) {
  const [items, setItems] = useState<Tournament[]>([]);
  const [summaries, setSummaries] = useState<Record<string, TournamentSummary>>({});
  const [filter, setFilter] = useState<TournamentFilter>('ACTIVE');
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const working = useRef(false);
  const requests = useRef(new Map<string, string>());
  useEffect(() => {
    if (!online) return;
    let active = true;
    api<Tournament[]>('/tournaments', undefined, account.token)
      .then(async (value) => {
        if (!active) return;
        setItems(value);
        const loaded = await Promise.allSettled(value.map((item) =>
          api<Detail>(`/tournaments/${item.id}`, undefined, account.token)));
        if (!active) return;
        const next: Record<string, TournamentSummary> = {};
        loaded.forEach((result, index) => {
          if (result.status !== 'fulfilled') return;
          const item = value[index];
          const fixtures = result.value.fixtures;
          next[item.id] = {
            teams: result.value.teams.length,
            matches: fixtures.length,
            status: item.startsOn > new Date().toISOString().slice(0, 10)
              ? 'UPCOMING'
              : fixtures.length > 0 && fixtures.every((fixture) => fixture.status === 'COMPLETED')
                ? 'COMPLETED' : 'ACTIVE',
          };
        });
        setSummaries(next);
      })
      .catch(() => {
        if (active) setMessage('Unable to load tournaments. Retry when connected.');
      });
    return () => {
      active = false;
    };
  }, [account.token, online, revision]);
  useEffect(() => {
    if (!selected || !online) return;
    let active = true;
    api<Detail>(`/tournaments/${selected}`, undefined, account.token)
      .then((value) => {
        if (active) setDetail(value);
      })
      .catch(() => {
        if (active) setMessage('Unable to refresh this tournament.');
      });
    return () => {
      active = false;
    };
  }, [selected, account.token, online, revision]);
  async function save(path: string, body: object, withId = true) {
    if (working.current || !online) return;
    working.current = true;
    setBusy(true);
    setMessage('');
    const key = path + JSON.stringify(body);
    if (!requests.current.has(key)) requests.current.set(key, crypto.randomUUID());
    try {
      const result = await api<Detail>(
        path,
        withId ? { ...body, id: requests.current.get(key) } : body,
        account.token,
      );
      requests.current.delete(key);
      setDetail(result);
      setSelected(result.tournament.id);
      setFilter(result.tournament.startsOn > new Date().toISOString().slice(0, 10) ? 'UPCOMING' : 'ACTIVE');
      setRevision((value) => value + 1);
      setMessage('Saved.');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Unable to save. Retry with the same details.',
      );
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  const teamName = (id: string) => detail?.teams.find((item) => item.id === id)?.name ?? 'Team';
  const visibleItems = items.filter((item) => (summaries[item.id]?.status ??
    (item.startsOn > new Date().toISOString().slice(0, 10) ? 'UPCOMING' : 'ACTIVE')) === filter);
  return (
    <section aria-label="My tournaments" className="account-dashboard tournament-screen">
      {!selected ? <>
        <header className="list-screen-heading"><h2>Your Tournaments</h2><p>Manage all your competitions</p></header>
        <div className="list-filter-tabs" role="tablist" aria-label="Tournament status">
          {(['ACTIVE', 'UPCOMING', 'COMPLETED'] as const).map((status) => <button key={status} type="button" role="tab" aria-selected={filter === status} className={filter === status ? 'active' : ''} onClick={() => setFilter(status)}>{status[0] + status.slice(1).toLowerCase()}</button>)}
        </div>
        <div className="tournament-list">
          {visibleItems.map((item) => {
            const summary = summaries[item.id];
            return <button type="button" className="tournament-list-card" key={item.id} onClick={() => { setSelected(item.id); setDetail(null); setDetailTab('overview'); setMessage(''); }}>
              <span className="tournament-card-top"><strong>{item.name}</strong><em>{summary?.status ?? filter}</em></span>
              <span className="tournament-card-venue">⌖ {item.venue}</span>
              <span className="tournament-card-date">{item.startsOn}</span>
              <span className="tournament-card-counts"><b>{summary?.teams ?? '—'}</b> Teams <b>{summary?.matches ?? '—'}</b> Matches</span>
            </button>;
          })}
          {!visibleItems.length && <div className="list-empty">No {filter.toLowerCase()} tournaments yet.</div>}
        </div>
      </> : null}
      {!online && (
        <p>
          Offline — showing the last loaded details. Reconnect to manage tournaments or refresh
          scores.
        </p>
      )}
      {!selected && <details className="tournament-create">
        <summary>+ Create Tournament</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void save('/tournaments', {
              name: String(data.get('name')).trim(),
              venue: String(data.get('venue')).trim(),
              startsOn: data.get('date'),
              halfMinutes: Number(data.get('half')),
              raidSeconds: Number(data.get('raid')),
            });
          }}
        >
          <fieldset disabled={busy || !online}>
            <label>
              Tournament name
              <input name="name" required maxLength={100} />
            </label>
            <label>
              Venue
              <input name="venue" required maxLength={160} />
            </label>
            <label>
              Start date
              <input name="date" required type="date" />
            </label>
            <label>
              Half duration (minutes)
              <input name="half" required type="number" min={1} max={60} defaultValue={20} />
            </label>
            <label>
              Raid duration (seconds)
              <input name="raid" required type="number" min={5} max={120} defaultValue={30} />
            </label>
            <button>Create tournament</button>
          </fieldset>
        </form>
      </details>}
      {!selected && <button
        className="secondary"
        disabled={!online || busy}
        onClick={() => setRevision((value) => value + 1)}
      >
        Refresh tournaments
      </button>}
      {detail && detail.tournament.id === selected && (
        <div key={selected} className="tournament-detail">
          <header className="tournament-detail-header">
            <button type="button" className="tournament-back" aria-label="Back to tournaments" onClick={() => { setSelected(''); setDetail(null); }}>←</button>
            <div><h2>{detail.tournament.name}</h2><p>⌖ {detail.tournament.venue}</p></div>
            <span className="tournament-detail-status">{summaries[selected]?.status ?? 'ACTIVE'}</span>
          </header>
          <div className="tournament-detail-stats">
            <div><strong>{detail.teams.length}</strong><span>Teams</span></div>
            <div><strong>{detail.fixtures.length}</strong><span>Matches</span></div>
            <div><strong>{detail.fixtures.filter((fixture) => fixture.status === 'COMPLETED').length}</strong><span>Done</span></div>
            <div><strong>{detail.fixtures.filter((fixture) => fixture.status !== 'COMPLETED').length}</strong><span>Left</span></div>
          </div>
          <div className="list-filter-tabs tournament-detail-tabs" role="tablist" aria-label="Tournament details">
            {(['overview', 'teams', 'matches', 'standings', 'players'] as const).map((tab) => <button type="button" key={tab} role="tab" aria-selected={detailTab === tab} className={detailTab === tab ? 'active' : ''} onClick={() => setDetailTab(tab)}>{tab[0].toUpperCase() + tab.slice(1)}</button>)}
          </div>
          {detailTab === 'overview' && <div className="tournament-overview">
            <div className="tournament-info-card"><small>TOURNAMENT INFO</small><dl>
              <div><dt>Venue</dt><dd>{detail.tournament.venue}</dd></div>
              <div><dt>Start date</dt><dd>{detail.tournament.startsOn}</dd></div>
              <div><dt>Half duration</dt><dd>{detail.tournament.halfMinutes} minutes</dd></div>
              <div><dt>Raid duration</dt><dd>{detail.tournament.raidSeconds} seconds</dd></div>
            </dl></div>
            <div className="tournament-info-card"><small>NEXT STEP</small><p>Add teams and their reusable rosters, then schedule fixtures. Prepared matches can be scored offline.</p></div>
          </div>}
          {detailTab === 'teams' && <div className="tournament-tab-content">
          <h4>Registered teams ({detail.teams.length})</h4>
          <p>
            Register team names here. Select seven starters and optional substitutes when preparing
            each match.
          </p>
          <ul className="tournament-team-list">
            {detail.teams.map((item) => (
              <li key={item.id}>
                <span className="tournament-team-code">{item.name.slice(0, 3).toUpperCase()}</span>
                <span><strong>{item.name}</strong><small>{item.roster?.length ?? 0} players</small></span>
                <b>{detail.standings?.find((row) => row.teamId === item.id)?.tablePoints ?? 0} <small>pts</small></b>
              </li>
            ))}
          </ul>
          <details className="tournament-action-form"><summary>+ Add Team</summary><form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void save(`/tournaments/${selected}/teams`, {
                name: String(data.get('name')).trim(),
              });
            }}
          >
            <label>
              Team name
              <input name="name" required maxLength={60} disabled={busy || !online} />
            </label>
            <button disabled={busy || !online}>Register team</button>
          </form></details>
          <h4>Reusable team rosters</h4>
          <p>
            Save seven starters and up to five substitutes once, then use them in future fixtures.
            Player phones stay in the creator-only tournament.
          </p>
          {detail.teams.map((team) => (
            <RosterEditor
              key={`${team.id}:${team.rosterRevision}`}
              team={team}
              busy={busy}
              online={online}
              onSave={(players) =>
                void save(
                  `/tournaments/${selected}/teams/${team.id}/roster`,
                  { players, expectedRevision: team.rosterRevision },
                  false,
                )
              }
            />
          ))}
          </div>}
          {detailTab === 'matches' && <div className="tournament-tab-content">
          <details className="tournament-action-form"><summary>+ Schedule Match</summary><form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              if (data.get('a') === data.get('b')) {
                setMessage('Choose two different teams.');
                return;
              }
              void save(`/tournaments/${selected}/fixtures`, {
                teamAId: data.get('a'),
                teamBId: data.get('b'),
                scheduledAt: data.get('time')
                  ? new Date(String(data.get('time'))).toISOString()
                  : null,
              });
            }}
          >
            <fieldset disabled={busy || !online || detail.teams.length < 2}>
              <label>
                Team A
                <select name="a" required>
                  <option value="">Choose team</option>
                  {detail.teams.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Team B
                <select name="b" required>
                  <option value="">Choose team</option>
                  {detail.teams.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Scheduled time (optional, your local time)
                <input name="time" type="datetime-local" />
              </label>
              <button>Add fixture</button>
            </fieldset>
          </form></details>
          <h4>Fixtures ({detail.fixtures.length})</h4>
          <p>
            Prepare match preloads team names, saved rosters and tournament timers. Its fixture link
            is retried automatically after sync. The tournament organizer scores it in the MVP.
          </p>
          {detail.fixtures.map((fixture) => (
            <div key={fixture.id} className="fixture-card">
              <strong>
                {teamName(fixture.teamAId)} vs {teamName(fixture.teamBId)}
              </strong>
              <p>
                {fixture.scheduledAt
                  ? new Date(fixture.scheduledAt).toLocaleString()
                  : 'Time to be confirmed'}
              </p>
              <FixtureSchedule
                key={`${fixture.id}:${fixture.scheduleRevision}`}
                fixture={fixture}
                busy={busy}
                online={online}
                onSave={(scheduledAt) =>
                  void save(
                    `/tournaments/${selected}/fixtures/${fixture.id}/schedule`,
                    {
                      scheduledAt,
                      expectedRevision: fixture.scheduleRevision,
                    },
                    false,
                  )
                }
              />
              {!fixture.matchId &&
                !matches.some((match) => match.fixtureRef?.fixtureId === fixture.id) && (
                  <button
                    className="secondary"
                    type="button"
                    onClick={() =>
                      onPrepareFixture({
                        tournamentId: selected,
                        fixtureId: fixture.id,
                        teamA: teamName(fixture.teamAId),
                        teamB: teamName(fixture.teamBId),
                        halfMinutes: detail.tournament.halfMinutes,
                        raidSeconds: detail.tournament.raidSeconds,
                        rosterA:
                          detail.teams.find((team) => team.id === fixture.teamAId)?.roster ?? [],
                        rosterB:
                          detail.teams.find((team) => team.id === fixture.teamBId)?.roster ?? [],
                      })
                    }
                  >
                    Prepare match
                  </button>
                )}
              {!fixture.matchId &&
                matches.some((match) => match.fixtureRef?.fixtureId === fixture.id) && (
                  <p>Match prepared on this device. Sync it to link this fixture.</p>
                )}
              {fixture.matchId ? (
                <div>
                  <p>
                    {fixture.scoreA} – {fixture.scoreB} · {fixture.status?.replaceAll('_', ' ')} ·
                    Last loaded synced score
                  </p>
                  {fixture.phase && fixture.phase !== 'REGULATION' && (
                    <p>
                      {fixture.phase.replaceAll('_', ' ')}: {fixture.tieScoreA} –{' '}
                      {fixture.tieScoreB}
                    </p>
                  )}
                  {fixture.winner && (
                    <p>
                      {fixture.winner === 'DRAW'
                        ? 'Draw'
                        : `Winner: ${teamName(fixture.winner === 'TEAM_A' ? fixture.teamAId : fixture.teamBId)}`}
                    </p>
                  )}
                </div>
              ) : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const matchId = new FormData(event.currentTarget).get('matchId');
                    void save(
                      `/tournaments/${selected}/fixtures/${fixture.id}/match`,
                      { matchId },
                      false,
                    );
                  }}
                >
                  <label>
                    Synced match
                    <select name="matchId" required disabled={!online || busy}>
                      <option value="">Choose matching match</option>
                      {matches
                        .filter(
                          (match) =>
                            match.serverAccountId === account.accountId &&
                            match.state.teams[0].name === teamName(fixture.teamAId) &&
                            match.state.teams[1].name === teamName(fixture.teamBId) &&
                            match.state.halfMinutes === detail.tournament.halfMinutes &&
                            match.state.raidSeconds === detail.tournament.raidSeconds &&
                            !detail.fixtures.some((item) => item.matchId === match.id),
                        )
                        .map((match) => (
                          <option key={match.id} value={match.id}>
                            {match.name} · {new Date(match.createdAt).toLocaleString()}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button disabled={!online || busy}>Link match</button>
                </form>
              )}
            </div>
          ))}
          {!detail.fixtures.length && <p>No fixtures scheduled yet.</p>}
          </div>}
          {detailTab === 'standings' && <div className="tournament-tab-content">
          <h4>Standings</h4>
          <p>
            Completed synced matches only. Win 3 points, accepted tie 1, loss 0. Ranked by table
            points, then score difference. Equal rows share a rank.
          </p>
          <div className="standings-scroll">
            <table className="standings-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Team</th>
                  <th>Played</th>
                  <th>W</th>
                  <th>D</th>
                  <th>L</th>
                  <th>Points</th>
                  <th>For</th>
                  <th>Against</th>
                  <th>Diff</th>
                </tr>
              </thead>
              <tbody>
                {detail.standings?.map((row) => (
                  <tr key={row.teamId}>
                    <td>{row.rank}</td>
                    <td>{row.teamName}</td>
                    <td>{row.played}</td>
                    <td>{row.won}</td>
                    <td>{row.drawn}</td>
                    <td>{row.lost}</td>
                    <td>{row.tablePoints}</td>
                    <td>{row.pointsFor}</td>
                    <td>{row.pointsAgainst}</td>
                    <td>
                      {row.scoreDifference > 0 ? `+${row.scoreDifference}` : row.scoreDifference}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>}
          {detailTab === 'players' && <div className="tournament-tab-content">
            <h4>Players</h4>
            {detail.teams.flatMap((team) => (team.roster ?? []).map((player) => ({ team: team.name, ...player }))).map((player) => <div className="tournament-player-row" key={`${player.team}:${player.phone}`}><strong>{player.name}</strong><small>{player.team}</small></div>)}
            {!detail.teams.some((team) => team.roster?.length) && <p>Save a team roster to see its players here.</p>}
          </div>}
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}

function FixtureSchedule({
  fixture,
  busy,
  online,
  onSave,
}: {
  fixture: Fixture;
  busy: boolean;
  online: boolean;
  onSave: (scheduledAt: string | null) => void;
}) {
  const [localTime, setLocalTime] = useState(() => {
    if (!fixture.scheduledAt) return '';
    const date = new Date(fixture.scheduledAt);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave(localTime ? new Date(localTime).toISOString() : null);
      }}
    >
      <label>
        Fixture time (local)
        <input
          type="datetime-local"
          value={localTime}
          disabled={busy || !online}
          onChange={(event) => setLocalTime(event.target.value)}
        />
      </label>
      <button className="secondary" disabled={busy || !online}>
        Save fixture time
      </button>
    </form>
  );
}

function RosterEditor({
  team,
  busy,
  online,
  onSave,
}: {
  team: Team;
  busy: boolean;
  online: boolean;
  onSave: (players: { name: string; phone: string }[]) => void;
}) {
  const [players, setPlayers] = useState(() =>
    team.roster?.length
      ? structuredClone(team.roster)
      : Array.from({ length: 7 }, () => ({ name: '', phone: '' })),
  );
  const [error, setError] = useState('');
  function update(index: number, field: 'name' | 'phone', value: string) {
    setPlayers((current) =>
      current.map((player, at) => (at === index ? { ...player, [field]: value } : player)),
    );
  }
  return (
    <details className="fixture-card">
      <summary>
        {team.name} roster ({team.roster?.length ?? 0} saved)
      </summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const normalized = players.map((player) => ({
              name: player.name.trim(),
              phone: normalizePhone(player.phone),
            }));
            if (normalized.some((player) => !player.name || player.name.length > 70))
              throw new Error('Enter a name for every player.');
            if (new Set(normalized.map((player) => player.phone)).size !== normalized.length)
              throw new Error('Each player needs a unique phone number.');
            setError('');
            onSave(normalized);
          } catch (cause) {
            setError((cause as Error).message);
          }
        }}
      >
        {players.map((player, index) => (
          <div className="player-input" key={index}>
            <span className="number">{String(index + 1).padStart(2, '0')}</span>
            <label>
              <span className="sr-only">
                {team.name} player {index + 1} name
              </span>
              <input
                required
                maxLength={70}
                placeholder={index < 7 ? 'Starter name' : 'Substitute name'}
                value={player.name}
                disabled={busy || !online}
                onChange={(event) => update(index, 'name', event.target.value)}
              />
            </label>
            <label>
              <span className="sr-only">
                {team.name} player {index + 1} phone
              </span>
              <input
                required
                type="tel"
                placeholder="Mobile number"
                value={player.phone}
                disabled={busy || !online}
                onChange={(event) => update(index, 'phone', event.target.value)}
              />
            </label>
            {index >= 7 && (
              <button
                type="button"
                className="quiet"
                disabled={busy || !online}
                aria-label={`Remove ${team.name} substitute ${index - 6}`}
                onClick={() => setPlayers((current) => current.filter((_, at) => at !== index))}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          className="secondary"
          disabled={busy || !online || players.length >= 12}
          onClick={() => setPlayers((current) => [...current, { name: '', phone: '' }])}
        >
          Add substitute
        </button>
        <button disabled={busy || !online}>Save roster</button>
        {team.roster?.length ? (
          <button
            type="button"
            className="quiet"
            disabled={busy || !online}
            onClick={() => onSave([])}
          >
            Clear roster
          </button>
        ) : null}
        {error && <p role="alert">{error}</p>}
      </form>
    </details>
  );
}
