import { describe, expect, it } from 'vitest';
import { applyEvent } from './apply-event';
import { activePlayers, type MatchState, type Side, type Team } from './match-types';

export function initialState(): MatchState {
  const team = (side: number): Team => ({
    name: `Team ${side}`,
    queue: [],
    activeSubstitutions: 0,
    players: Array.from({ length: 9 }, (_, i) => ({
      id: `${side}-${i}`,
      name: `Player ${side}-${i}`,
      phone: `+9198765432${side}${i}`,
      status: i < 7 ? 'ACTIVE' : 'BENCH',
      raidPoints: 0,
      tacklePoints: 0,
    })),
  });
  return {
    teams: [team(0), team(1)],
    scores: [0, 0],
    tieScores: [0, 0],
    pairScores: [0, 0],
    tieRaids: [0, 0],
    tieBreakerRaiders: [[], []],
    lastTieRaiders: ['', ''],
    goldenPair: 0,
    half: 1,
    phase: 'REGULATION',
    status: 'LIVE',
    turn: 0,
    firstTurn: 0,
    raidNumber: 1,
    winner: null,
    halfMinutes: 20,
    raidSeconds: 30,
    clock: { remainingMs: 1200000, startedAt: 0 },
    raidClock: { remainingMs: 30000, startedAt: null },
    currentRaiderId: null,
    expiryReviewed: false,
  };
}
function markOut(state: MatchState, side: Side, ids: string[]) {
  state.teams[side].queue = ids;
  state.teams[side].players.forEach((p) => {
    if (ids.includes(p.id)) p.status = 'OUT';
  });
}
function raid(
  state: MatchState,
  options: {
    outcome?: 'EMPTY' | 'TOUCH' | 'TACKLE' | 'SELF_OUT';
    defenderIds?: string[];
    bonus?: boolean;
    tacklerId?: string;
    selfOutDefenderIds?: string[];
    defenderOutOrder?: string[];
  } = {},
) {
  const raiderId =
    state.phase === 'TIE_BREAK'
      ? state.tieBreakerRaiders[state.turn][state.tieRaids[state.turn]]
      : state.phase === 'GOLDEN_RAID'
        ? state.tieBreakerRaiders[state.turn].find((id) => id !== state.lastTieRaiders[state.turn])!
        : activePlayers(state.teams[state.turn])[0].id;
  const started = applyEvent(state, { type: 'START_RAID', raiderId }, 1000).state;
  return applyEvent(
    started,
    { type: 'RAID', raiderId, outcome: 'EMPTY', defenderIds: [], bonus: false, ...options },
    2000,
  );
}

describe('local match state transitions', () => {
  it('touch and Self-Out consequences remain in one raid event', () => {
    const state = initialState();
    markOut(state, 0, ['0-1', '0-2']);
    markOut(state, 1, ['1-0', '1-1', '1-2', '1-3', '1-4']);
    const result = raid(state, {
      outcome: 'TOUCH',
      defenderIds: ['1-5'],
      selfOutDefenderIds: ['1-6'],
      defenderOutOrder: ['1-5', '1-6'],
    });
    expect(result.state.scores).toEqual([4, 0]);
    expect(result.state.teams[0].players[0].raidPoints).toBe(1);
    expect(result.state.teams[0].queue).toEqual([]);
    expect(result.components.map((c) => c.kind)).toEqual(['TOUCH', 'SELF_OUT', 'ALL_OUT']);
    expect(result.state.raidNumber).toBe(2);
  });
  it('Super Tackle at three credits one player and revives FIFO once', () => {
    const state = initialState();
    markOut(state, 1, ['1-0', '1-1', '1-2', '1-3']);
    const result = raid(state, { outcome: 'TACKLE', tacklerId: '1-4' }).state;
    expect(result.scores).toEqual([0, 2]);
    expect(result.teams[1].queue).toEqual(['1-1', '1-2', '1-3']);
    expect(result.teams[1].players[4].tacklePoints).toBe(1);
    expect(result.teams[0].queue).toEqual(['0-0']);
    expect(state.scores).toEqual([0, 0]);
  });
  it('bonus and technical points leave revival queues unchanged', () => {
    const state = initialState();
    markOut(state, 0, ['0-1']);
    const bonus = raid(state, { bonus: true }).state;
    expect(bonus.scores).toEqual([1, 0]);
    expect(bonus.teams[0].queue).toEqual(['0-1']);
    const technical = applyEvent(bonus, { type: 'TECHNICAL', side: 0 }, 0).state;
    expect(technical.scores).toEqual([2, 0]);
    expect(technical.teams[0].queue).toEqual(['0-1']);
    expect(technical.teams[0].players[0].raidPoints).toBe(1);
  });
  it('All-Out restores current seven and separates individual points', () => {
    const state = initialState();
    markOut(state, 1, ['1-0', '1-1', '1-2', '1-3', '1-4', '1-5']);
    const result = raid(state, { outcome: 'TOUCH', defenderIds: ['1-6'] });
    expect(result.state.scores).toEqual([3, 0]);
    expect(result.state.teams[0].players[0].raidPoints).toBe(1);
    expect(activePlayers(result.state.teams[1])).toHaveLength(7);
    expect(result.state.teams[1].queue).toEqual([]);
    expect(result.components.filter((c) => c.kind === 'ALL_OUT')).toEqual([
      { side: 0, kind: 'ALL_OUT', points: 2 },
    ]);
  });
  it('last raider self-out awards All-Out without false tackle credit', () => {
    const state = initialState();
    markOut(state, 0, ['0-1', '0-2', '0-3', '0-4', '0-5', '0-6']);
    markOut(state, 1, ['1-1']);
    const result = raid(state, { outcome: 'SELF_OUT' }).state;
    expect(result.scores).toEqual([0, 3]);
    expect(result.teams[1].queue).toEqual([]);
    expect(result.teams[1].players.every((p) => p.tacklePoints === 0)).toBe(true);
    expect(activePlayers(result.teams[0])).toHaveLength(7);
  });
  it('defender self-out revives opposite FIFO without ending the raid', () => {
    const state = initialState();
    markOut(state, 0, ['0-3', '0-2']);
    const result = applyEvent(state, { type: 'DEFENDER_SELF_OUT', playerId: '1-0' }, 0).state;
    expect(result.scores).toEqual([1, 0]);
    expect(result.teams[0].queue).toEqual(['0-2']);
    expect(result.teams[1].queue).toEqual(['1-0']);
    expect(result.turn).toBe(0);
    expect(result.raidNumber).toBe(1);
  });
  it('half-time carries queue and resets only substitution allowance', () => {
    const state = initialState();
    markOut(state, 0, ['0-3', '0-1']);
    state.teams[0].activeSubstitutions = 3;
    const halfTime = applyEvent(state, { type: 'END_HALF' }, 100).state;
    const second = applyEvent(halfTime, { type: 'SECOND_HALF' }, 200).state;
    expect(second.teams[0].queue).toEqual(['0-3', '0-1']);
    expect(second.teams[0].activeSubstitutions).toBe(0);
    expect(second.turn).toBe(1);
  });
  it('OUT substitutions inherit queue position and active fourth is rejected', () => {
    const state = initialState();
    markOut(state, 0, ['0-3', '0-1']);
    state.teams[0].activeSubstitutions = 3;
    const next = applyEvent(
      state,
      { type: 'SUBSTITUTE', side: 0, outgoingId: '0-3', incomingId: '0-7' },
      0,
    ).state;
    expect(next.teams[0].queue).toEqual(['0-7', '0-1']);
    expect(next.teams[0].players[7].status).toBe('OUT');
    expect(() =>
      applyEvent(next, { type: 'SUBSTITUTE', side: 0, outgoingId: '0-0', incomingId: '0-8' }, 0),
    ).toThrow('Three active');
  });
  it('expiry requires an explicit decision and cannot silently score', () => {
    const started = applyEvent(initialState(), { type: 'START_RAID', raiderId: '0-0' }, 0).state;
    const intent = {
      type: 'RAID',
      raiderId: '0-0',
      outcome: 'EMPTY',
      defenderIds: [],
      bonus: false,
    } as const;
    expect(() => applyEvent(started, { ...intent, defenderIds: [] }, 31000)).toThrow(
      'Resolve the raid expiry',
    );
    const reviewed = applyEvent(started, { type: 'NOT_EXPIRED' }, 31000).state;
    expect(applyEvent(reviewed, { ...intent, defenderIds: [] }, 32000).state.raidNumber).toBe(2);
  });
  it('paused scoring and invalid players are rejected', () => {
    const state = initialState();
    expect(() => raid(applyEvent(state, { type: 'PAUSE' }, 0).state)).toThrow();
    expect(() => applyEvent(state, { type: 'START_RAID', raiderId: '1-0' }, 0)).toThrow();
    expect(() => raid(state, { outcome: 'TOUCH', defenderIds: ['1-0', '1-0'] })).toThrow(
      'only be selected once',
    );
  });
  it('five raids each enter golden pairs and only a full pair can decide', () => {
    let state = initialState();
    state.half = 2;
    state = applyEvent(state, { type: 'END_MATCH' }, 0).state;
    state = applyEvent(
      state,
      {
        type: 'TIE_BREAK',
        raiderIds: [
          ['0-0', '0-1', '0-2', '0-3', '0-4'],
          ['1-0', '1-1', '1-2', '1-3', '1-4'],
        ],
      },
      0,
    ).state;
    for (let i = 0; i < 10; i++) state = raid(state).state;
    expect(state.phase).toBe('GOLDEN_RAID');
    expect(state.goldenPair).toBe(1);
    state = raid(state).state;
    state = raid(state).state;
    expect(state.goldenPair).toBe(2);
    state = raid(state, { bonus: true }).state;
    expect(state.status).toBe('LIVE');
    expect(state.winner).toBeNull();
    state = raid(state).state;
    expect(state.status).toBe('COMPLETED');
    expect(state.winner).toBe(0);
    expect(state.scores).toEqual([0, 0]);
    expect(state.tieScores).toEqual([8, 6]);
  });
});
