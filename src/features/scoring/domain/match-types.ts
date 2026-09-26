import type { RaidOutcome } from './score-raid';

export type Side = 0 | 1;
export type Phase = 'REGULATION' | 'TIE_BREAK' | 'GOLDEN_RAID';
export type MatchStatus = 'LIVE' | 'PAUSED' | 'HALF_TIME' | 'TIED' | 'COMPLETED';
export interface Player {
  id: string;
  name: string;
  phone: string;
  status: 'ACTIVE' | 'OUT' | 'BENCH';
  raidPoints: number;
  tacklePoints: number;
}
export interface Team {
  name: string;
  players: Player[];
  queue: string[];
  activeSubstitutions: number;
}
export interface ClockState {
  remainingMs: number;
  startedAt: number | null;
}
export interface MatchState {
  teams: [Team, Team];
  scores: [number, number];
  tieScores: [number, number];
  pairScores: [number, number];
  tieRaids: [number, number];
  tieBreakerRaiders: [string[], string[]];
  lastTieRaiders: [string, string];
  goldenPair: number;
  half: 1 | 2;
  phase: Phase;
  status: MatchStatus;
  turn: Side;
  firstTurn: Side;
  raidNumber: number;
  winner: Side | 'DRAW' | null;
  halfMinutes: number;
  raidSeconds: number;
  clock: ClockState;
  raidClock: ClockState;
  currentRaiderId: string | null;
  expiryReviewed: boolean;
}
export type MatchIntent =
  | { type: 'START_RAID'; raiderId: string }
  | { type: 'NOT_EXPIRED' }
  | {
      type: 'RAID';
      raiderId: string;
      outcome: RaidOutcome;
      defenderIds: string[];
      selfOutDefenderIds?: string[];
      defenderOutOrder?: string[];
      tacklerId?: string;
      bonus: boolean;
    }
  | { type: 'TECHNICAL'; side: Side }
  | { type: 'DEFENDER_SELF_OUT'; playerId: string }
  | { type: 'SUBSTITUTE'; side: Side; outgoingId: string; incomingId: string }
  | { type: 'TIE_BREAK'; raiderIds: [string[], string[]] }
  | { type: 'PAUSE' | 'RESUME' | 'END_HALF' | 'SECOND_HALF' | 'END_MATCH' | 'DRAW' }
  | { type: 'UNDO'; targetEventId: string };
export interface ScoreComponent {
  kind: 'TOUCH' | 'BONUS' | 'TACKLE' | 'SUPER_TACKLE_EXTRA' | 'SELF_OUT' | 'ALL_OUT' | 'TECHNICAL';
  side: Side;
  points: number;
  playerId?: string;
}
export interface MatchEvent {
  id: string;
  matchId: string;
  sequence: number;
  baseVersion: number;
  rulesetVersion: 'raidzon-v1' | 'raidzon-v2';
  scorerSessionId: string;
  createdAt: string;
  intent: MatchIntent;
  components: ScoreComponent[];
  summary: string;
  before: MatchState;
  after: MatchState;
  syncStatus: 'PENDING' | 'SYNCED';
}
export interface LocalMatch {
  initialState?: MatchState;
  serverAccountId?: string;
  localAccountId?: string;
  scoringDelegated?: boolean;
  serverVersion?: number;
  syncError?: string;
  rulesetVersion?: 'raidzon-v1' | 'raidzon-v2';
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  ownerSessionId: string;
  version: number;
  state: MatchState;
}
export const opposite = (side: Side): Side => (side === 0 ? 1 : 0);
export const activePlayers = (team: Team) =>
  team.players.filter((player) => player.status === 'ACTIVE');
export const remainingTime = (clock: ClockState, now: number) =>
  Math.max(
    0,
    clock.remainingMs - (clock.startedAt === null ? 0 : Math.max(0, now - clock.startedAt)),
  );
