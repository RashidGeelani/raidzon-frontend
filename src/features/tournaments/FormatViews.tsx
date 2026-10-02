import type { ReactNode } from 'react';
import {
  fixtureSections,
  fixtureWinnerSide,
  isKnockout,
  sideName,
  type FormatFixture,
  type FormatStanding,
  type TournamentFormat,
  type TournamentGroup,
} from './data/format-types';

/** League table, or one table per group with the qualifying places marked. */
export function GroupTables({
  standings,
  groups,
  format,
}: {
  standings: FormatStanding[];
  groups: TournamentGroup[];
  format?: TournamentFormat | null;
}) {
  if (format?.type === 'KNOCKOUT') return null;
  const tables = format?.type === 'GROUPS_KNOCKOUT'
    ? groups.map((group) => ({ key: group.id ?? group.name, title: `Group ${group.name}`, rows: standings.filter((row) => row.groupId === group.id) }))
    : [{ key: 'league', title: 'Points table', rows: standings }];
  if (!standings.length) return <p className="list-empty">The table appears once teams are added.</p>;
  return (
    <div className="standings-tables">
      {tables.map((table) => (
        <section className="standings-card" key={table.key} aria-label={table.title}>
          <header><strong>{table.title}</strong>{format?.type === 'GROUPS_KNOCKOUT' && <small>Top {format.advancePerGroup} go through</small>}</header>
          <table className="standings-table">
            <thead>
              <tr><th scope="col">#</th><th scope="col">Team</th><th scope="col" title="Played">P</th><th scope="col" title="Won">W</th><th scope="col" title="Drawn">D</th><th scope="col" title="Lost">L</th><th scope="col" title="Point difference">PD</th><th scope="col" title="Table points">Pts</th></tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr key={row.teamId} className={row.qualifies ? 'qualifies' : ''}>
                  <td>{row.rank}</td>
                  <th scope="row">{row.teamName}</th>
                  <td>{row.played ?? 0}</td>
                  <td>{row.won ?? 0}</td>
                  <td>{row.drawn ?? 0}</td>
                  <td>{row.lost ?? 0}</td>
                  <td>{row.scoreDifference > 0 ? `+${row.scoreDifference}` : row.scoreDifference}</td>
                  <td><b>{row.tablePoints}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <p className="standings-note">Win 3 · Draw 1 · Loss 0. Level on points: point difference, then scoring ratio.</p>
    </div>
  );
}

function BracketMatch({ fixture, teamName }: { fixture: FormatFixture; teamName: (id: string) => string }) {
  const winner = fixtureWinnerSide(fixture);
  const live = !!fixture.matchId && fixture.status !== 'COMPLETED';
  const drawn = fixture.status === 'COMPLETED' && fixture.winner === 'DRAW';
  const tie = fixture.phase && fixture.phase !== 'REGULATION';
  const row = (side: 'A' | 'B') => {
    const decided = side === 'A' ? fixture.teamAId : fixture.teamBId;
    const score = side === 'A' ? fixture.scoreA : fixture.scoreB;
    const tieScore = side === 'A' ? fixture.tieScoreA : fixture.tieScoreB;
    return (
      <div className={`bracket-team ${winner === side ? 'won' : winner ? 'lost' : ''} ${decided ? '' : 'tbd'}`}>
        <span>{sideName(fixture, side, teamName)}</span>
        {fixture.matchId && <b>{score ?? 0}{tie && tieScore != null ? <small> ({tieScore})</small> : null}</b>}
      </div>
    );
  };
  return (
    <div className={`bracket-match ${live ? 'live' : ''}`}>
      {live && <span className="bracket-live">LIVE</span>}
      {row('A')}
      {row('B')}
      {drawn && <p className="bracket-note">Drawn — play the tie-break to decide</p>}
      {!fixture.matchId && fixture.scheduledAt && <p className="bracket-note">{new Date(fixture.scheduledAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>}
    </div>
  );
}

/** Knockout rounds side by side (scrolls sideways on phones), third place under the final, champion banner. */
export function BracketView({
  fixtures,
  teamName,
  championId,
}: {
  fixtures: FormatFixture[];
  teamName: (id: string) => string;
  championId?: string | null;
}) {
  const knockout = fixtures.filter((fixture) => fixture.stage === 'KNOCKOUT');
  if (!knockout.length) return <p className="list-empty">The bracket appears once fixtures are generated.</p>;
  const rounds = [...new Set(knockout.map((fixture) => fixture.round ?? 0))].sort((a, b) => a - b);
  const third = fixtures.find((fixture) => fixture.stage === 'THIRD_PLACE');
  return (
    <div className="bracket-wrap">
      {championId && (
        <div className="champion-banner" role="status">
          <span aria-hidden="true">🏆</span>
          <div><small>CHAMPIONS</small><strong>{teamName(championId)}</strong></div>
        </div>
      )}
      <div className="bracket" style={{ gridTemplateColumns: `repeat(${rounds.length}, minmax(170px, 1fr))` }}>
        {rounds.map((round) => {
          const games = knockout.filter((fixture) => (fixture.round ?? 0) === round).sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
          return (
            <section className="bracket-round" key={round} aria-label={games[0]?.roundName ?? `Round ${round}`}>
              <h4>{games[0]?.roundName ?? `Round ${round}`}</h4>
              <div className="bracket-round-games">
                {games.map((fixture) => <BracketMatch key={fixture.id} fixture={fixture} teamName={teamName} />)}
                {round === rounds[rounds.length - 1] && third && (
                  <div className="bracket-third">
                    <h4>Third place</h4>
                    <BracketMatch fixture={third} teamName={teamName} />
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Fixtures grouped as League rounds / Group A, B / knockout rounds; the caller renders each card. */
export function StagedFixtures({
  fixtures,
  groups,
  renderFixture,
}: {
  fixtures: FormatFixture[];
  groups: TournamentGroup[];
  renderFixture: (fixture: FormatFixture) => ReactNode;
}) {
  // Matches in progress are pulled up into "Live now" instead of appearing twice.
  const live = fixtures.filter((fixture) => fixture.matchId && fixture.status !== 'COMPLETED');
  const sections = fixtureSections(fixtures.filter((fixture) => !live.includes(fixture)), groups);
  return (
    <div className="staged-fixtures">
      {live.length > 0 && (
        <section className="fixture-section live-now" aria-label="Live now">
          <h4><i aria-hidden="true" /> Live now</h4>
          {live.map((fixture) => <div key={`live-${fixture.id}`}>{renderFixture(fixture)}</div>)}
        </section>
      )}
      {sections.map((section) => (
        <section className="fixture-section" key={section.key} aria-label={section.title}>
          <h4>{section.title}<small>{section.fixtures.filter((f) => f.status === 'COMPLETED').length}/{section.fixtures.length} played</small></h4>
          {section.fixtures.map((fixture) => <div key={fixture.id} className={isKnockout(fixture) ? 'knockout-fixture' : ''}>{renderFixture(fixture)}</div>)}
        </section>
      ))}
    </div>
  );
}
