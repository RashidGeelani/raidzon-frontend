export interface PreparedFixture {
  tournamentId: string;
  fixtureId: string;
  teamA: string;
  teamB: string;
  halfMinutes: number;
  raidSeconds: number;
  rosterA: { name: string; phone: string }[];
  rosterB: { name: string; phone: string }[];
}
