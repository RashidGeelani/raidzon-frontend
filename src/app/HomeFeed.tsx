import type { LocalMatch } from '../features/scoring/domain/match-types';
import type { PreparedFixture } from '../features/tournaments/types';
import { UpcomingMatches } from '../features/tournaments/UpcomingMatches';
import { useJoinedTournaments } from '../features/tournaments/JoinedTournamentMatches';
import { MatchActions } from '../features/scorecard/MatchActions';

/**
 * Home answers "what's happening for me?": matches to resume on this phone, live matches in
 * followed tournaments, the next fixture to score, and the followed tournaments themselves.
 */
export function HomeFeed({
  matches,
  canResume,
  online,
  loaded,
  session,
  onOpenMatch,
  onStartMatch,
  onPrepare,
  onOpenTournament,
  onBrowseTournaments,
}: {
  matches: LocalMatch[];
  canResume: (match: LocalMatch) => boolean;
  online: boolean;
  loaded: boolean;
  session: string;
  onOpenMatch: (id: string) => void;
  onStartMatch: () => void;
  onPrepare: (fixture: PreparedFixture) => void;
  onOpenTournament: (id: string) => void;
  onBrowseTournaments: () => void;
}) {
  const resumable = matches.filter(
    (match) => match.state.status !== 'COMPLETED' && canResume(match),
  );
  const { details } = useJoinedTournaments(online);
  const live = details.flatMap((detail) =>
    detail.fixtures
      .filter((fixture) => fixture.matchId && fixture.status !== 'COMPLETED')
      .map((fixture) => ({
        ...fixture,
        tournament: detail.tournament.name,
        name: (id: string | null, label?: string | null) =>
          detail.teams.find((team) => team.id === id)?.name ?? label ?? 'To be decided',
      })),
  );
  const recent = matches.filter((match) => match.state.status === 'COMPLETED').slice(0, 3);
  return (
    <div className="home-feed">
      <div className="section-heading home-heading">
        <div>
          <p className="eyebrow">WELCOME TO THE COURT</p>
          <h1>Ready for the next raid?</h1>
        </div>
      </div>
      <div className="home-main">
        {resumable.length > 0 && (
          <section className="home-block" aria-label="Resume scoring">
            <h2>Resume scoring</h2>
            {resumable.map((match) => (
              <button
                key={match.id}
                className="home-match home-resume"
                onClick={() => onOpenMatch(match.id)}
              >
                <span className="home-match-meta">
                  <i className="dot live" />{' '}
                  {match.state.status === 'LIVE'
                    ? `Half ${match.state.half} · Raid ${match.state.raidNumber}`
                    : match.state.status.replaceAll('_', ' ').toLowerCase()}
                </span>
                <span className="home-match-teams">
                  <strong>{match.state.teams[0].name}</strong>
                  <b>
                    {match.state.scores[0]} : {match.state.scores[1]}
                  </b>
                  <strong>{match.state.teams[1].name}</strong>
                </span>
                <span className="home-match-cta">Resume match →</span>
              </button>
            ))}
          </section>
        )}

        {live.length > 0 && (
          <section className="home-block" aria-label="Live now">
            <h2>
              <i className="dot live" aria-hidden="true" /> Live now
            </h2>
            {live.map((fixture) => (
              <article className="home-match" key={fixture.id}>
                <span className="home-match-meta">{fixture.tournament}</span>
                <span className="home-match-teams">
                  <strong>{fixture.name(fixture.teamAId, fixture.labelA)}</strong>
                  <b>
                    {fixture.scoreA ?? 0} : {fixture.scoreB ?? 0}
                  </b>
                  <strong>{fixture.name(fixture.teamBId, fixture.labelB)}</strong>
                </span>
                <MatchActions
                  matchId={fixture.matchId!}
                  matches={matches}
                  onScore={onOpenMatch}
                  completed={false}
                />
              </article>
            ))}
          </section>
        )}

        <section className="home-block home-next" aria-label="Next fixture">
          <UpcomingMatches
            matches={matches}
            online={online}
            onPrepare={onPrepare}
            limit={1}
            quiet
          />
        </section>

        {!resumable.length && (
          <section className="home-start panel" aria-label="Start a match">
            <h2>Start a match</h2>
            <p>Two teams, seven players each. Works without a connection.</p>
            <button className="primary" disabled={!session} onClick={onStartMatch}>
              ＋ Start a match
            </button>
          </section>
        )}
      </div>
      <div className="home-side">
        <section className="home-block" aria-label="Followed tournaments">
          <h2>Followed tournaments</h2>
          {details.length ? (
            <div className="home-tournaments">
              {details.map((detail) => {
                const liveCount = detail.fixtures.filter(
                  (fixture) => fixture.matchId && fixture.status !== 'COMPLETED',
                ).length;
                const played = detail.fixtures.filter(
                  (fixture) => fixture.status === 'COMPLETED',
                ).length;
                return (
                  <button
                    key={detail.tournament.id}
                    className="home-tournament"
                    onClick={() => onOpenTournament(detail.tournament.id)}
                  >
                    <strong>{detail.tournament.name}</strong>
                    <small>{detail.tournament.venue}</small>
                    <span>
                      {liveCount ? <em>● {liveCount} live</em> : null}
                      {played}/{detail.fixtures.length} played
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="list-empty">
              Join a tournament to follow its scores here.{' '}
              <button type="button" className="link-button" onClick={onBrowseTournaments}>
                Browse tournaments
              </button>
            </p>
          )}
        </section>

        {loaded && recent.length > 0 && (
          <section className="home-block" aria-label="Recent results">
            <h2>Recent results</h2>
            {recent.map((match) => (
              <button key={match.id} className="home-match" onClick={() => onOpenMatch(match.id)}>
                <span className="home-match-teams">
                  <strong>{match.state.teams[0].name}</strong>
                  <b>
                    {match.state.scores[0]} : {match.state.scores[1]}
                  </b>
                  <strong>{match.state.teams[1].name}</strong>
                </span>
                <span className="home-match-cta">
                  {match.practice && <span className="practice-tag">PRACTICE</span>} View result →
                </span>
              </button>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
