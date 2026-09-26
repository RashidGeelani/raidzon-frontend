export type RaidOutcome = 'TOUCH' | 'EMPTY' | 'TACKLE' | 'SELF_OUT';
export interface RaidFacts {
  outcome: RaidOutcome;
  defendingCount: number;
  touches: number;
  bonus: boolean;
  defenderSelfOuts?: number;
}
export interface RaidScore {
  attackingPoints: number;
  defendingPoints: number;
  raiderPoints: number;
  defenderPoints: number;
  attackingRevivals: number;
  defendingRevivals: number;
  allOutPoints: number;
  superTackleExtra: number;
}

/** Pure component evaluator. All-Out of the raider's side is applied by the state engine. */
export function scoreRaid(facts: RaidFacts): RaidScore {
  const { outcome, defendingCount, touches, bonus } = facts;
  const defenderSelfOuts = facts.defenderSelfOuts ?? 0;
  if (!['TOUCH', 'EMPTY', 'TACKLE', 'SELF_OUT'].includes(outcome))
    throw new Error('Invalid raid outcome.');
  if (!Number.isInteger(defendingCount) || defendingCount < 1 || defendingCount > 7)
    throw new Error('Invalid defending count.');
  if (!Number.isInteger(touches) || touches < 0 || touches > defendingCount)
    throw new Error('Invalid touch count.');
  if ((outcome === 'TOUCH' && touches === 0) || (outcome === 'EMPTY' && touches > 0))
    throw new Error('Touch outcome requires defenders out.');
  if (
    !Number.isInteger(defenderSelfOuts) ||
    defenderSelfOuts < 0 ||
    touches + defenderSelfOuts > defendingCount
  )
    throw new Error('Invalid defender self-out count.');
  if (typeof bonus !== 'boolean' || (bonus && defendingCount < 6))
    throw new Error('Bonus requires at least six defenders.');
  const opposingOuts =
    (outcome === 'TACKLE' || outcome === 'SELF_OUT') && touches + defenderSelfOuts > 0;
  const allOutPoints = touches + defenderSelfOuts === defendingCount && !opposingOuts ? 2 : 0;
  const superTackleExtra = outcome === 'TACKLE' && defendingCount <= 3 && !opposingOuts ? 1 : 0;
  const raiderPoints = touches + Number(bonus);
  const defendingPoints =
    outcome === 'TACKLE' ? 1 + superTackleExtra : outcome === 'SELF_OUT' ? 1 : 0;
  return {
    attackingPoints: raiderPoints + defenderSelfOuts + allOutPoints,
    defendingPoints,
    raiderPoints,
    defenderPoints: outcome === 'TACKLE' ? 1 : 0,
    attackingRevivals: touches + defenderSelfOuts,
    defendingRevivals: defendingPoints > 0 ? 1 : 0,
    allOutPoints,
    superTackleExtra,
  };
}
