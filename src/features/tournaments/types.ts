export interface PreparedFixture {
  tournamentId: string;
  fixtureId: string;
  teamA: string;
  teamB: string;
  halfMinutes: number;
  raidSeconds: number;
  rosterA: { name: string; phone: string; jersey?: number | null }[];
  rosterB: { name: string; phone: string; jersey?: number | null }[];
  /** Knockout fixture: the match must have a winner (no draw). */
  knockout?: boolean;
}
