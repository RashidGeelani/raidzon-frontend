import type { LocalMatch } from '../../scoring/domain/match-types';
import type { PreparedFixture } from '../types';

export interface TournamentListItem {
  id: string;
  name: string;
  venue: string;
  startsOn: string;
  halfMinutes: number;
  raidSeconds: number;
}

export interface TournamentFixtureDetail {
  tournament: TournamentListItem;
  teams: { id: string; name: string; roster: { name: string; phone: string }[] }[];
  fixtures: { id: string; teamAId: string | null; teamBId: string | null; scheduledAt: string | null; matchId: string | null; stage?: string }[];
}

export interface UpcomingFixture {
  id: string;
  tournamentName: string;
  venue: string;
  scheduledAt: string | null;
  prepared: PreparedFixture;
}

export function collectUpcomingFixtures(details: TournamentFixtureDetail[], matches: LocalMatch[]): UpcomingFixture[] {
  const localFixtureIds = new Set(matches.map((match) => match.fixtureRef?.fixtureId).filter(Boolean));
  return details.flatMap(({ tournament, teams, fixtures }) => fixtures
    .filter((fixture) => !fixture.matchId && !localFixtureIds.has(fixture.id))
    .map((fixture): UpcomingFixture | null => {
      const teamA = teams.find((team) => team.id === fixture.teamAId);
      const teamB = teams.find((team) => team.id === fixture.teamBId);
      if (!teamA || !teamB) return null;
      return {
        id: fixture.id,
        tournamentName: tournament.name,
        venue: tournament.venue,
        scheduledAt: fixture.scheduledAt,
        prepared: {
          tournamentId: tournament.id,
          fixtureId: fixture.id,
          teamA: teamA.name,
          teamB: teamB.name,
          halfMinutes: tournament.halfMinutes,
          raidSeconds: tournament.raidSeconds,
          rosterA: teamA.roster ?? [],
          rosterB: teamB.roster ?? [],
          knockout: fixture.stage === 'KNOCKOUT' || fixture.stage === 'THIRD_PLACE',
        },
      };
    }).filter((fixture): fixture is UpcomingFixture => fixture !== null))
    .sort((a, b) => (a.scheduledAt ?? '9999').localeCompare(b.scheduledAt ?? '9999'));
}
