import type { MatchEvent, MatchState, Player, Side } from './match-types';

export interface TeamPerformance {
  name: string;
  total: number;
  raidPoints: number;
  tacklePoints: number;
  allOutPoints: number;
  extraPoints: number;
  superRaids: number;
  superTackles: number;
  successfulRaids: number;
  raids: number;
}
export interface Standout {
  player: Pick<Player, 'id' | 'name' | 'raidPoints' | 'tacklePoints'>;
  side: Side;
  team: string;
}
export interface MatchSummary {
  winner: Side | 'DRAW' | null;
  headline: string;
  teams: [TeamPerformance, TeamPerformance];
  playerOfTheMatch: Standout | null;
  topRaider: Standout | null;
  topDefender: Standout | null;
}

/** Kabaddi milestones in a single match: a Super 10 is 10+ raid points, a High 5 is 5+ tackle points. */
export const SUPER_TEN = 10;
export const HIGH_FIVE = 5;
export type Milestone = 'Super 10' | 'High 5';
export function milestones(player: Pick<Player, 'raidPoints' | 'tacklePoints'>): Milestone[] {
  const earned: Milestone[] = [];
  if (player.raidPoints >= SUPER_TEN) earned.push('Super 10');
  if (player.tacklePoints >= HIGH_FIVE) earned.push('High 5');
  return earned;
}

/** Events that still count: undo entries and the events they reversed are left out. */
export function countedEvents(events: MatchEvent[]) {
  const reversed = new Set(events.flatMap((e) => (e.intent.type === 'UNDO' ? [e.intent.targetEventId] : [])));
  return events.filter((e) => e.intent.type !== 'UNDO' && !reversed.has(e.id));
}

export function summarizeMatch(state: MatchState, events: MatchEvent[]): MatchSummary {
  const counted = countedEvents(events);
  const teams = state.teams.map((team, index) => {
    const side = index as Side;
    // The breakdown adds up to the regulation total; tie-break points are shown separately.
    const parts = counted.filter((e) => e.before.phase === 'REGULATION').flatMap((e) => e.components).filter((c) => c.side === side);
    const sum = (...kinds: string[]) => parts.filter((c) => kinds.includes(c.kind)).reduce((total, c) => total + c.points, 0);
    const raids = counted.filter((e) => e.intent.type === 'RAID' && e.before.turn === side);
    const raidPointsOf = (e: MatchEvent) =>
      e.components.filter((c) => c.side === side && (c.kind === 'TOUCH' || c.kind === 'BONUS')).reduce((t, c) => t + c.points, 0);
    return {
      name: team.name,
      total: state.scores[side],
      raidPoints: sum('TOUCH', 'BONUS'),
      tacklePoints: sum('TACKLE', 'SUPER_TACKLE_EXTRA'),
      allOutPoints: sum('ALL_OUT'),
      extraPoints: sum('SELF_OUT', 'TECHNICAL'),
      superRaids: raids.filter((e) => raidPointsOf(e) >= 3).length,
      superTackles: parts.filter((c) => c.kind === 'SUPER_TACKLE_EXTRA').length,
      successfulRaids: raids.filter((e) => raidPointsOf(e) > 0).length,
      raids: raids.length,
    };
  }) as [TeamPerformance, TeamPerformance];

  const players: Standout[] = state.teams.flatMap((team, index) =>
    team.players.map((player) => ({ player, side: index as Side, team: team.name })),
  );
  const best = (score: (s: Standout) => number) => {
    const ranked = players
      .filter((s) => score(s) > 0)
      .sort(
        (a, b) =>
          score(b) - score(a) ||
          Number(b.side === state.winner) - Number(a.side === state.winner) ||
          b.player.raidPoints + b.player.tacklePoints - (a.player.raidPoints + a.player.tacklePoints),
      );
    return ranked[0] ?? null;
  };
  const winner = state.winner;
  const headline =
    winner === 'DRAW'
      ? 'Match drawn'
      : winner === null
        ? 'Match in progress'
        : `${state.teams[winner].name} win`;
  return {
    winner,
    headline,
    teams,
    playerOfTheMatch: best((s) => s.player.raidPoints + s.player.tacklePoints),
    topRaider: best((s) => s.player.raidPoints),
    topDefender: best((s) => s.player.tacklePoints),
  };
}

/** Final score as shown on the scoreboard: tie-break/golden raid scores are shown after regulation. */
export function finalScoreLine(state: MatchState) {
  const regulation = `${state.scores[0]} – ${state.scores[1]}`;
  return state.phase === 'REGULATION' ? regulation : `${regulation} (tie-break ${state.tieScores[0]} – ${state.tieScores[1]})`;
}
