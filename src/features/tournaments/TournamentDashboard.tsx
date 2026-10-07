import { useEffect, useRef, useState } from 'react';
import { Tabs } from '../../ui/Tabs';
import { Chip } from '../../ui/Chip';
import { TournamentLeaders } from '../scoring/components/SyncedLeaderboards';
import { api, type AccountSession } from '../identity/data/auth-client';
import type { LocalMatch } from '../scoring/domain/match-types';
import type { PreparedFixture } from './types';
import { MatchActions } from '../scorecard/MatchActions';
import { normalizePhone, parseJersey } from '../matches/data/match-repository';
import { cachedTeams, refreshTeamCache, type TeamDetail } from '../teams/data/team-client';
import { JoinRequestsPanel } from './JoinRequestsPanel';
import type { Focus } from '../notifications/notification-client';
import { FormatSetup } from './FormatSetup';
import { BracketView, GroupTables, StagedFixtures } from './FormatViews';
import { FORMAT_LABELS, isKnockout, sideName, type FormatFixture, type FormatStanding, type TournamentFormat, type TournamentGroup } from './data/format-types';

/** Today's date on this phone (YYYY-MM-DD), so a tournament starting today is active after midnight local time. */
function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

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
  roster: { name: string; phone: string; jersey?: number | null }[];
  /** Set when the team was registered from a saved team. */
  teamId?: string | null;
}
type Fixture = FormatFixture & { scheduleRevision: number };
interface Detail {
  tournament: Tournament;
  teams: Team[];
  fixtures: Fixture[];
  standings: FormatStanding[];
  registrationOpen?: boolean;
  format?: TournamentFormat;
  groups?: TournamentGroup[];
  championId?: string | null;
}
type TournamentFilter = 'ACTIVE' | 'UPCOMING' | 'COMPLETED';
type TournamentSummary = { teams: number; matches: number; status: TournamentFilter };
type DetailTab = 'overview' | 'teams' | 'format' | 'matches' | 'standings' | 'bracket' | 'leaders' | 'players';
const TAB_LABELS: Record<DetailTab, string> = { overview: 'Overview', teams: 'Teams', format: 'Format', matches: 'Matches', standings: 'Table', bracket: 'Bracket', leaders: 'Leaders', players: 'Players' };
export function TournamentDashboard({
  account,
  online,
  matches,
  onPrepareFixture,
  onScoreMatch,
  startCreating = false,
  focus = null,
}: {
  account: AccountSession;
  online: boolean;
  matches: LocalMatch[];
  onPrepareFixture: (fixture: PreparedFixture) => void;
  onScoreMatch?: (id: string) => void;
  startCreating?: boolean;
  focus?: Focus | null;
}) {
  const [items, setItems] = useState<Tournament[]>([]);
  const [summaries, setSummaries] = useState<Record<string, TournamentSummary>>({});
  const [filter, setFilter] = useState<TournamentFilter>('ACTIVE');
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [editingTeam, setEditingTeam] = useState<string | null>(null);
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const working = useRef(false);
  const requests = useRef(new Map<string, string>());
  useEffect(() => {
    if (!focus?.tournamentId) return;
    setSelected(focus.tournamentId);
    setDetail(null);
    setEditingTeam(null);
    setDetailTab('teams');
    setMessage('');
  }, [focus?.nonce, focus?.tournamentId]);
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
            status: item.startsOn > localToday()
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
  const [savedTeams, setSavedTeams] = useState<TeamDetail[]>([]);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    const show = () => cachedTeams(account.accountId).then((rows) => { if (active) setSavedTeams(rows.filter((team) => team.myRole !== 'COACH')); });
    void show().then(() => (online ? refreshTeamCache(account).then(show) : undefined)).catch(() => undefined);
    return () => { active = false; };
  }, [account, online, selected]);
  /** Returns true when the change was saved. */
  async function save(path: string, body: object, withId = true): Promise<boolean> {
    if (working.current || !online) return false;
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
      setFilter(result.tournament.startsOn > localToday() ? 'UPCOMING' : 'ACTIVE');
      setRevision((value) => value + 1);
      setMessage('Saved.');
      return true;
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Unable to save. Retry with the same details.',
      );
      return false;
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  /** Regenerating replaces unplayed fixtures, so matches already prepared on this phone would lose theirs. */
  function confirmReplacingPrepared() {
    const prepared = matches.filter(
      (match) => match.fixtureRef?.tournamentId === selected && !match.fixtureRef.linked && !match.fixtureRef.linkError,
    ).length;
    return (
      !prepared ||
      window.confirm(
        `${prepared} match${prepared === 1 ? ' is' : 'es are'} being scored on this phone for current fixtures. Changing the fixtures means ${prepared === 1 ? 'it' : 'they'} won't count in the tournament. Continue?`,
      )
    );
  }
  const teamName = (id: string) => detail?.teams.find((item) => item.id === id)?.name ?? 'Team';
  const visibleItems = items.filter((item) => (summaries[item.id]?.status ??
    (item.startsOn > localToday() ? 'UPCOMING' : 'ACTIVE')) === filter);
  return (
    <section aria-label="My tournaments" className="account-dashboard tournament-screen">
      {!selected ? <>
        <header className="list-screen-heading"><h2>Your Tournaments</h2><p>Manage all your competitions</p></header>
        <Tabs label="Tournament status" value={filter} onChange={setFilter} items={(['ACTIVE', 'UPCOMING', 'COMPLETED'] as const).map((status) => ({ value: status, label: status[0] + status.slice(1).toLowerCase() }))} />
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
      {!selected && <details className="tournament-create tournament-create-banner" open={startCreating || undefined}>
        <summary>
          <span className="tournament-create-banner-icon" aria-hidden="true">🏆</span>
          <span className="tournament-create-banner-text"><strong>Host your own tournament</strong><small>Register teams, schedule fixtures and score every raid live.</small></span>
          <span className="tournament-create-banner-cta">+ Create</span>
        </summary>
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
      {selected && (!detail || detail.tournament.id !== selected) && (
        // Loading or failed: never leave the organizer on a blank screen without a way out.
        <div className="tournament-detail-pending">
          <button type="button" className="tournament-back" aria-label="Back to tournaments" onClick={() => { setSelected(''); setDetail(null); setMessage(''); }}>←</button>
          {message ? (
            <button type="button" className="secondary" disabled={!online} onClick={() => { setMessage(''); setRevision((value) => value + 1); }}>Try again</button>
          ) : (
            <p className="muted">{online ? 'Loading tournament…' : 'Reconnect to open this tournament.'}</p>
          )}
        </div>
      )}
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
          <Tabs
            label="Tournament details"
            className="tournament-detail-tabs"
            value={detailTab}
            onChange={(tab) => { setDetailTab(tab); setEditingTeam(null); }}
            items={(['overview', 'teams', 'format', 'matches', 'standings', 'bracket', 'leaders', 'players'] as const)
              .filter((tab) => (tab === 'bracket' ? detail.format?.type !== undefined && detail.format.type !== 'LEAGUE' : tab === 'standings' ? detail.format?.type !== 'KNOCKOUT' : true))
              .map((tab) => ({ value: tab, label: TAB_LABELS[tab] }))}
          />
          {detailTab === 'overview' && <div className="tournament-overview">
            <div className="tournament-info-card"><small>TOURNAMENT INFO</small><dl>
              <div><dt>Venue</dt><dd>{detail.tournament.venue}</dd></div>
              <div><dt>Start date</dt><dd>{detail.tournament.startsOn}</dd></div>
              <div><dt>Half duration</dt><dd>{detail.tournament.halfMinutes} minutes</dd></div>
              <div><dt>Raid duration</dt><dd>{detail.tournament.raidSeconds} seconds</dd></div>
              <div><dt>Format</dt><dd>{FORMAT_LABELS[detail.format?.type ?? 'LEAGUE']}{detail.format?.type === 'GROUPS_KNOCKOUT' ? ` · ${detail.format.groupCount} group${detail.format.groupCount === 1 ? '' : 's'}, top ${detail.format.advancePerGroup} go through` : ''}{detail.format?.thirdPlace ? ' · third-place match' : ''}</dd></div>
            </dl></div>
            {detail.championId && <div className="champion-banner"><span aria-hidden="true">🏆</span><div><small>CHAMPIONS</small><strong>{teamName(detail.championId)}</strong></div></div>}
            <div className="tournament-info-card"><small>NEXT STEP</small><p>{!detail.teams.length ? 'Add teams and their rosters.' : !detail.fixtures.length ? 'Choose the format and generate fixtures in the Format tab.' : 'Prepare and score fixtures from Matches. Prepared matches can be scored offline.'}</p>
              {detail.teams.length > 1 && !detail.fixtures.length && <button type="button" className="secondary" onClick={() => setDetailTab('format')}>Set up format →</button>}</div>
          </div>}
          {detailTab === 'teams' && <div className="tournament-tab-content">
          {!editingTeam && <>
          <div className="management-heading"><div><h3>Teams</h3><p>{detail.teams.length} registered · Select a team to manage its players.</p></div></div>
          <ul className="tournament-team-list">
            {detail.teams.map((item) => (
              <li key={item.id}>
                <span className="tournament-team-code">{item.name.slice(0, 3).toUpperCase()}</span>
                <span><strong>{item.name}</strong><small>{item.roster?.length ?? 0} players{item.teamId ? ' · saved team' : ''}</small></span>
                <b>{detail.standings?.find((row) => row.teamId === item.id)?.tablePoints ?? 0} <small>pts</small></b>
                <button className="team-manage-button" onClick={() => setEditingTeam(item.id)}>Manage<span className="sr-only"> {item.name}</span></button>
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
          {savedTeams.length > 0 && <details className="tournament-action-form"><summary>+ Add from my teams</summary><form
            onSubmit={(event) => {
              event.preventDefault();
              const teamId = String(new FormData(event.currentTarget).get('savedTeam'));
              if (teamId) void save(`/tournaments/${selected}/teams/from-saved`, { teamId });
            }}
          >
            <label>
              Saved team
              <select name="savedTeam" required disabled={busy || !online} defaultValue="">
                <option value="" disabled>Choose a team</option>
                {savedTeams.map((team) => {
                  const registered = detail.teams.some((item) => item.teamId === team.id);
                  return <option key={team.id} value={team.id} disabled={registered || team.members.length < 7}>
                    {team.name} ({team.members.length} players{registered ? ', registered' : team.members.length < 7 ? ', needs 7' : ''})
                  </option>;
                })}
              </select>
            </label>
            <p className="field-note">The squad is copied as this team's tournament roster. A player can play for only one team in a tournament.</p>
            <button disabled={busy || !online}>Register saved team</button>
          </form></details>}
          {!detail.teams.length && <p className="list-empty">Add your first team to start building the roster.</p>}
          {selected && <JoinRequestsPanel<Detail>
            account={account}
            online={online}
            tournamentId={selected}
            registrationOpen={detail.registrationOpen !== false}
            onDetail={(next) => { setDetail(next); setRevision((value) => value + 1); }}
          />}
          </>}
          {editingTeam && <button className="roster-back" onClick={() => setEditingTeam(null)}>← All teams</button>}
          {detail.teams.filter((team) => team.id === editingTeam).map((team) => (
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
              onSync={team.teamId ? () => void save(`/tournaments/${selected}/teams/${team.id}/sync`, {}, false) : undefined}
            />
          ))}
          </div>}
          {detailTab === 'format' && detail.format && <div className="tournament-tab-content">
            <FormatSetup
              format={detail.format}
              groups={detail.groups ?? []}
              teamCount={detail.teams.length}
              fixtureCount={detail.fixtures.length}
              teamName={teamName}
              busy={busy}
              online={online}
              onSaveFormat={(input) => { if (confirmReplacingPrepared()) void save(`/tournaments/${selected}/format`, input, false); }}
              onArrange={(groups) => { if (confirmReplacingPrepared()) void save(`/tournaments/${selected}/arrangement`, { groups }, false); }}
              onGenerate={() => { if (confirmReplacingPrepared()) void save(`/tournaments/${selected}/fixtures/generate`, {}, false).then((saved) => { if (saved) setDetailTab('matches'); }); }}
            />
          </div>}
          {detailTab === 'matches' && <div className="tournament-tab-content">
          {(detail.format?.type ?? 'LEAGUE') === 'LEAGUE' && <details className="tournament-action-form"><summary>+ Schedule Match</summary><form
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
          </form></details>}
          <StagedFixtures fixtures={detail.fixtures} groups={detail.groups ?? []} renderFixture={(item) => {
            const fixture = item as Fixture;
            const decided = !!fixture.teamAId && !!fixture.teamBId;
            const prepared = matches.some((match) => match.fixtureRef?.fixtureId === fixture.id);
            const winner = fixture.status === 'COMPLETED' ? fixture.winner : null;
            const tie = fixture.phase && fixture.phase !== 'REGULATION';
            return (
            <div className={`fixture-row ${isKnockout(fixture) ? 'knockout' : ''} ${fixture.matchId && fixture.status !== 'COMPLETED' ? 'live' : ''}`}>
              <div className="fixture-row-meta">
                {fixture.roundName && <span className="fixture-stage">{fixture.roundName}</span>}
                <span>{fixture.scheduledAt ? new Date(fixture.scheduledAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'Time TBC'}</span>
                {fixture.matchId && (fixture.status === 'COMPLETED' ? <Chip tone="success">Full time</Chip> : <Chip tone="live">● Live</Chip>)}
              </div>
              <div className="fixture-row-teams">
                <span className={winner === 'TEAM_A' ? 'won' : ''}>{sideName(fixture, 'A', teamName)}</span>
                <b>{fixture.matchId ? `${fixture.scoreA ?? 0} – ${fixture.scoreB ?? 0}` : 'vs'}</b>
                <span className={winner === 'TEAM_B' ? 'won' : ''}>{sideName(fixture, 'B', teamName)}</span>
              </div>
              {tie && <p className="fixture-row-note">{fixture.phase!.replaceAll('_', ' ').toLowerCase()}: {fixture.tieScoreA} – {fixture.tieScoreB}</p>}
              {winner === 'DRAW' && <p className="fixture-row-note">{isKnockout(fixture) ? 'Drawn — a knockout needs a winner: undo and play the tie-break.' : 'Draw'}</p>}
              {!fixture.matchId && !decided && <p className="fixture-row-note">Teams are decided by earlier results.</p>}
              {!fixture.matchId && prepared && <p className="fixture-row-note">Prepared on this phone. It links to this fixture after it syncs.</p>}
              <div className="fixture-row-actions">
                {fixture.matchId && <MatchActions matchId={fixture.matchId} matches={matches} onScore={onScoreMatch} completed={fixture.status === 'COMPLETED'} />}
                {!fixture.matchId && decided && !prepared && (
                  <button
                    className="primary"
                    type="button"
                    onClick={() =>
                      onPrepareFixture({
                        tournamentId: selected,
                        fixtureId: fixture.id,
                        teamA: teamName(fixture.teamAId!),
                        teamB: teamName(fixture.teamBId!),
                        halfMinutes: detail.tournament.halfMinutes,
                        raidSeconds: detail.tournament.raidSeconds,
                        rosterA: detail.teams.find((team) => team.id === fixture.teamAId)?.roster ?? [],
                        rosterB: detail.teams.find((team) => team.id === fixture.teamBId)?.roster ?? [],
                        knockout: isKnockout(fixture),
                      })
                    }
                  >
                    Score this match
                  </button>
                )}
                {!fixture.matchId && (
                  <details className="fixture-more">
                    <summary>More</summary>
                    <FixtureSchedule
                      key={`${fixture.id}:${fixture.scheduleRevision}`}
                      fixture={fixture}
                      busy={busy}
                      online={online}
                      onSave={(scheduledAt) =>
                        void save(`/tournaments/${selected}/fixtures/${fixture.id}/schedule`, { scheduledAt, expectedRevision: fixture.scheduleRevision }, false)
                      }
                    />
                    {decided && <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        const matchId = new FormData(event.currentTarget).get('matchId');
                        void save(`/tournaments/${selected}/fixtures/${fixture.id}/match`, { matchId }, false);
                      }}
                    >
                      <label>
                        Link a match already scored
                        <select name="matchId" required disabled={!online || busy}>
                          <option value="">Choose a match</option>
                          {matches
                            .filter(
                              (match) =>
                                match.serverAccountId === account.accountId &&
                                match.state.teams[0].name.trim().toLowerCase() === teamName(fixture.teamAId!).trim().toLowerCase() &&
                                match.state.teams[1].name.trim().toLowerCase() === teamName(fixture.teamBId!).trim().toLowerCase() &&
                                !detail.fixtures.some((other) => other.matchId === match.id),
                            )
                            .map((match) => (
                              <option key={match.id} value={match.id}>
                                {match.name} · {new Date(match.createdAt).toLocaleString()}
                              </option>
                            ))}
                        </select>
                      </label>
                      <button className="secondary" disabled={!online || busy}>Link match</button>
                    </form>}
                  </details>
                )}
              </div>
            </div>
          ); }} />
          {!detail.fixtures.length && <p>No fixtures scheduled yet.</p>}
          </div>}
          {detailTab === 'standings' && <div className="tournament-tab-content">
            <GroupTables standings={detail.standings ?? []} groups={detail.groups ?? []} format={detail.format} />
            <p className="field-note">Completed, synced matches only.</p>
          </div>}
          {detailTab === 'bracket' && <div className="tournament-tab-content">
            <BracketView fixtures={detail.fixtures} teamName={teamName} championId={detail.championId} />
          </div>}
          {detailTab === 'leaders' && selected && <div className="tournament-tab-content">
            <TournamentLeaders tournamentId={selected} online={online} />
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
  onSync,
}: {
  team: Team;
  busy: boolean;
  online: boolean;
  onSave: (players: { name: string; phone: string; jersey: number | null }[]) => void;
  onSync?: () => void;
}) {
  // jersey is kept as typed; it is optional on the roster and pre-fills match setup.
  const [players, setPlayers] = useState<{ name: string; phone: string; jersey: string }[]>(() =>
    team.roster?.length
      ? team.roster.map((player) => ({ name: player.name, phone: player.phone, jersey: player.jersey == null ? '' : String(player.jersey) }))
      : Array.from({ length: 7 }, () => ({ name: '', phone: '', jersey: '' })),
  );
  const [error, setError] = useState('');
  function update(index: number, field: 'name' | 'phone' | 'jersey', value: string) {
    setPlayers((current) =>
      current.map((player, at) => (at === index ? { ...player, [field]: value } : player)),
    );
  }
  return (
    <section className="roster-workspace" aria-label={`${team.name} roster`}>
      <header className="management-heading"><div><small>TEAM ROSTER</small><h3>{team.name}</h3><p>Squad of 7–20 · Each match uses 7 starters and up to 5 substitutes</p></div><span className="roster-count">{team.roster?.length ?? 0} saved</span></header>
      {onSync && (
        <div className="roster-sync">
          <p className="field-note">Copied from your saved team. Update it here after changing the squad on the Teams tab.</p>
          <button type="button" className="secondary" disabled={busy || !online} onClick={onSync}>Update from squad</button>
        </div>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const normalized = players.map((player) => {
              if (player.jersey.trim() && parseJersey(player.jersey) === null)
                throw new Error('Jersey numbers are 0 to 999.');
              return {
                name: player.name.trim(),
                phone: normalizePhone(player.phone),
                jersey: parseJersey(player.jersey),
              };
            });
            if (normalized.some((player) => !player.name || player.name.length > 70))
              throw new Error('Enter a name for every player.');
            if (new Set(normalized.map((player) => player.phone)).size !== normalized.length)
              throw new Error('Each player needs a unique phone number.');
            const numbers = normalized.map((player) => player.jersey).filter((n) => n !== null);
            if (new Set(numbers).size !== numbers.length)
              throw new Error('Each player needs a different jersey number.');
            setError('');
            onSave(normalized);
          } catch (cause) {
            setError((cause as Error).message);
          }
        }}
      >
        {players.map((player, index) => (
          <div className="roster-player-card" key={index}>
            <span className="number">{String(index + 1).padStart(2, '0')}</span>
            <label className="jersey-field">
              <span className="sr-only">
                {team.name} player {index + 1} jersey number
              </span>
              <input
                inputMode="numeric"
                pattern="[0-9]{1,3}"
                maxLength={3}
                placeholder="#"
                value={player.jersey}
                disabled={busy || !online}
                onChange={(event) => update(index, 'jersey', event.target.value.replace(/\D/g, ''))}
              />
            </label>
            <label>
              <span className="sr-only">
                {team.name} player {index + 1} name
              </span>
              <input
                required
                maxLength={70}
                placeholder={index < 7 ? 'Player name' : 'Squad player name'}
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
                aria-label={`Remove ${team.name} squad player ${index + 1}`}
                onClick={() => setPlayers((current) => current.filter((_, at) => at !== index))}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        <div className="roster-actions"><button
          type="button"
          className="secondary"
          disabled={busy || !online || players.length >= 20}
          onClick={() => setPlayers((current) => [...current, { name: '', phone: '', jersey: '' }])}
        >
          Add player <small>{players.length}/20</small>
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
        </div>{error && <p role="alert">{error}</p>}
      </form>
    </section>
  );
}
