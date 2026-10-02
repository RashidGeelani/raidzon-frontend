/** Shapes shared by the organizer dashboard and the public tournament page. */
export type FormatType = 'LEAGUE' | 'KNOCKOUT' | 'GROUPS_KNOCKOUT';
export type Stage = 'LEAGUE' | 'GROUP' | 'KNOCKOUT' | 'THIRD_PLACE';

export interface FormatFixture {
  id: string;
  teamAId: string | null;
  teamBId: string | null;
  scheduledAt: string | null;
  matchId: string | null;
  status: string | null;
  scoreA: number | null;
  scoreB: number | null;
  phase: string | null;
  tieScoreA: number | null;
  tieScoreB: number | null;
  winner: string | null;
  scheduleRevision?: number;
  stage?: Stage;
  groupId?: string | null;
  round?: number | null;
  slot?: number | null;
  labelA?: string | null;
  labelB?: string | null;
  roundName?: string | null;
}
export interface FormatStanding {
  teamId: string;
  teamName: string;
  rank: number;
  played?: number;
  won?: number;
  drawn?: number;
  lost?: number;
  tablePoints: number;
  pointsFor?: number;
  pointsAgainst?: number;
  scoreDifference: number;
  groupId?: string | null;
  qualifies?: boolean;
}
export interface TournamentFormat {
  type: FormatType;
  groupCount: number;
  advancePerGroup: number;
  thirdPlace: boolean;
  locked: boolean;
  generated: boolean;
}
export interface TournamentGroup {
  id: string | null;
  name: string;
  teamIds: string[];
}

export const FORMAT_LABELS: Record<FormatType, string> = {
  LEAGUE: 'League',
  KNOCKOUT: 'Knockout',
  GROUPS_KNOCKOUT: 'Groups + knockout',
};

export const isKnockout = (fixture: Pick<FormatFixture, 'stage'>) => fixture.stage === 'KNOCKOUT' || fixture.stage === 'THIRD_PLACE';

/** Same rules as the server: teams going through must make a full bracket. Returns a message or null. */
export function formatProblem(type: FormatType, groups: number, advance: number): string | null {
  if (type !== 'GROUPS_KNOCKOUT') return null;
  if (advance === 1 && groups === 1) return 'With one group, send at least 2 teams through.';
  if (advance === 4 && groups !== 1) return 'Four teams go through only when there is a single group.';
  const qualifiers = groups * advance;
  if ((qualifiers & (qualifiers - 1)) !== 0 || qualifiers > 16) return 'Teams going through must make a full bracket (2, 4, 8 or 16).';
  return null;
}

export interface FixtureSection {
  key: string;
  title: string;
  fixtures: FormatFixture[];
}
/** League by round, each group, then knockout rounds in order and the third-place match before the final. */
export function fixtureSections(fixtures: FormatFixture[], groups: TournamentGroup[]): FixtureSection[] {
  const sections: FixtureSection[] = [];
  const add = (key: string, title: string, fixture: FormatFixture) => {
    let section = sections.find((item) => item.key === key);
    if (!section) sections.push((section = { key, title, fixtures: [] }));
    section.fixtures.push(fixture);
  };
  const groupName = (id?: string | null) => groups.find((group) => group.id === id)?.name ?? '';
  const league = fixtures.filter((f) => !f.stage || f.stage === 'LEAGUE');
  league.forEach((f) => add(f.round ? `league-${f.round}` : 'league', f.round ? `Round ${f.round}` : 'Matches', f));
  fixtures.filter((f) => f.stage === 'GROUP').sort((a, b) => groupName(a.groupId).localeCompare(groupName(b.groupId)) || (a.round ?? 0) - (b.round ?? 0))
    .forEach((f) => add(`group-${f.groupId}`, `Group ${groupName(f.groupId)}`, f));
  const knockout = fixtures.filter(isKnockout).sort((a, b) => (a.round ?? 0) - (b.round ?? 0) || (a.stage === 'THIRD_PLACE' ? -1 : 0) - (b.stage === 'THIRD_PLACE' ? -1 : 0) || (a.slot ?? 0) - (b.slot ?? 0));
  knockout.forEach((f) => add(f.stage === 'THIRD_PLACE' ? 'third' : `ko-${f.round}`, f.stage === 'THIRD_PLACE' ? 'Third place' : f.roundName ?? 'Knockout', f));
  return sections;
}

/** Display name of a side: the team when decided, otherwise where it comes from ("Winner Group A"). */
export function sideName(fixture: FormatFixture, side: 'A' | 'B', teamName: (id: string) => string) {
  const id = side === 'A' ? fixture.teamAId : fixture.teamBId;
  if (id) return teamName(id);
  return (side === 'A' ? fixture.labelA : fixture.labelB) ?? 'To be decided';
}

export function fixtureWinnerSide(fixture: FormatFixture): 'A' | 'B' | null {
  if (fixture.status !== 'COMPLETED') return null;
  return fixture.winner === 'TEAM_A' ? 'A' : fixture.winner === 'TEAM_B' ? 'B' : null;
}
