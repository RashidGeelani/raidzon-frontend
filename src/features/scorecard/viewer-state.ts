import type { ClockState, MatchState, Player, ScoreComponent } from '../scoring/domain/match-types';

/** The public match view (GET /public/matches/:id and the live socket), shared by /watch and /overlay. */
export type ViewerState = Pick<MatchState, 'scores' | 'tieScores' | 'status' | 'phase' | 'half' | 'raidNumber' | 'turn' | 'currentRaiderId' | 'clock' | 'raidClock' | 'winner'> & {
  /** queue: revival order (player IDs); absent from servers older than the viewer's out queue. */
  teams: { name: string; players: Omit<Player, 'phone'>[]; queue?: string[] }[];
};
export interface LiveView { state: ViewerState; serverTime: number; lastSyncedAt: number; version: number; /** Server clock minus the scoring phone's clock (ms). */ clockOffset?: number; tournamentId?: string | null; /** Absent from older servers. */ startedAt?: number | null; venue?: string | null; events: { id: string; summary: string; raidNumber: number; type: string; components?: ScoreComponent[] | null; /** Defenders put out (absent from older servers). */ touchedIds?: string[] | null; selfOutIds?: string[] | null }[] }
export function clockRemaining(clock: ClockState, now: number) {
  return Math.max(0, clock.remainingMs - (clock.startedAt == null ? 0 : Math.max(0, now - clock.startedAt)));
}
/** The server reports the winner as 'TEAM_A' / 'TEAM_B' / 'DRAW'; the scorer's phone uses 0 / 1 / 'DRAW'. */
export function winnerSide(winner: unknown): 0 | 1 | 'DRAW' | null {
  if (winner === 0 || winner === 'TEAM_A') return 0;
  if (winner === 1 || winner === 'TEAM_B') return 1;
  return winner === 'DRAW' ? 'DRAW' : null;
}
