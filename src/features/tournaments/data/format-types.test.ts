import { describe, expect, it } from 'vitest';
import { fixtureSections, formatProblem, sideName, type FormatFixture } from './format-types';
import { moveTeam } from '../GroupBoard';

const fixture = (id: string, extra: Partial<FormatFixture>): FormatFixture => ({
  id, teamAId: 'a', teamBId: 'b', scheduledAt: null, matchId: null, status: null, scoreA: null, scoreB: null,
  phase: null, tieScoreA: null, tieScoreB: null, winner: null, ...extra,
});

describe('tournament formats (client)', () => {
  it('matches the server rules for a full bracket', () => {
    expect(formatProblem('GROUPS_KNOCKOUT', 2, 2)).toBeNull();
    expect(formatProblem('GROUPS_KNOCKOUT', 1, 4)).toBeNull();
    expect(formatProblem('GROUPS_KNOCKOUT', 3, 2)).toMatch(/full bracket/);
    expect(formatProblem('GROUPS_KNOCKOUT', 1, 1)).toMatch(/at least 2/);
    expect(formatProblem('LEAGUE', 3, 2)).toBeNull();
  });
  it('groups fixtures: groups first, then knockout rounds with third place before the final', () => {
    const groups = [{ id: 'g1', name: 'A', teamIds: [] }, { id: 'g2', name: 'B', teamIds: [] }];
    const sections = fixtureSections([
      fixture('f', { stage: 'KNOCKOUT', round: 2, roundName: 'Final' }),
      fixture('t', { stage: 'THIRD_PLACE', round: 2 }),
      fixture('s1', { stage: 'KNOCKOUT', round: 1, slot: 0, roundName: 'Semi-final' }),
      fixture('b1', { stage: 'GROUP', groupId: 'g2', round: 1 }),
      fixture('a1', { stage: 'GROUP', groupId: 'g1', round: 1 }),
    ], groups);
    expect(sections.map((s) => s.title)).toEqual(['Group A', 'Group B', 'Semi-final', 'Third place', 'Final']);
  });
  it('names undecided sides by where they come from', () => {
    const f = fixture('x', { teamAId: null, labelA: 'Winner Group A' });
    expect(sideName(f, 'A', () => 'Team')).toBe('Winner Group A');
    expect(sideName(f, 'B', (id) => id.toUpperCase())).toBe('B');
  });
  it('moves a team between groups or before another team', () => {
    const groups = [{ id: 'g1', name: 'A', teamIds: ['a', 'b'] }, { id: 'g2', name: 'B', teamIds: ['c'] }];
    expect(moveTeam(groups, 'a', 1, null).map((g) => g.teamIds)).toEqual([['b'], ['c', 'a']]);
    expect(moveTeam(groups, 'b', 0, 'a').map((g) => g.teamIds)).toEqual([['b', 'a'], ['c']]);
  });
});
