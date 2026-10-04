import { describe, expect, it } from 'vitest';
import { applyEvent } from './apply-event';
import { initialState } from './apply-event.test';
import { isDoOrDie, type MatchState } from './match-types';

let now = 10_000;
const active = (state: MatchState, side: 0 | 1) =>
  state.teams[side].players.find((p) => p.status === 'ACTIVE')!.id;
function raid(state: MatchState, outcome: 'EMPTY' | 'TOUCH', ruleset = 'raidzon-v5') {
  const raiderId = active(state, state.turn);
  const started = applyEvent(state, { type: 'START_RAID', raiderId }, (now += 1000), ruleset).state;
  const defenderIds = outcome === 'TOUCH' ? [active(started, started.turn === 0 ? 1 : 0)] : [];
  return applyEvent(
    started,
    { type: 'RAID', raiderId, outcome, defenderIds, bonus: false },
    (now += 1000),
    ruleset,
  );
}

describe('Do-or-Die (raidzon-v5)', () => {
  it('the third empty raid in a row puts the raider out and scores for the defenders', () => {
    let state = initialState();
    for (let round = 0; round < 2; round++) {
      state = raid(state, 'EMPTY').state;
      state = raid(state, 'EMPTY').state;
    }
    expect(state.emptyRaids).toEqual([2, 2]);
    expect(isDoOrDie(state)).toBe(true);
    const raiderId = active(state, 0);
    const failed = raid(state, 'EMPTY');
    expect(failed.summary).toMatch(/: do-or-die raid failed$/);
    expect(failed.state.scores).toEqual([0, 1]);
    expect(failed.state.teams[0].players.find((p) => p.id === raiderId)!.status).toBe('OUT');
    expect(failed.state.emptyRaids).toEqual([0, 2]);
    const scored = raid(failed.state, 'TOUCH').state;
    expect(scored.emptyRaids).toEqual([0, 0]);
    expect(isDoOrDie(scored)).toBe(false);
  });

  it('the second half starts with no empty raids counted', () => {
    let state = initialState();
    state = raid(state, 'EMPTY').state;
    state = raid(state, 'EMPTY').state;
    state = applyEvent(state, { type: 'END_HALF' }, (now += 1000), 'raidzon-v5').state;
    state = applyEvent(state, { type: 'SECOND_HALF' }, (now += 1000), 'raidzon-v5').state;
    expect(state.emptyRaids).toEqual([0, 0]);
  });

  it('older rulesets never count empty raids', () => {
    let state = initialState();
    for (let i = 0; i < 6; i++) state = raid(state, 'EMPTY', 'raidzon-v4').state;
    expect(state.emptyRaids).toBeUndefined();
    expect(state.scores).toEqual([0, 0]);
  });
});
