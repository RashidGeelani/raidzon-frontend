import { describe, expect, it } from 'vitest';
import { applyEvent } from './apply-event';
import { initialState } from './apply-event.test';
import type { MatchEvent, MatchIntent, MatchState } from './match-types';
import { milestones, summarizeMatch } from './match-summary';

function play(intents: Exclude<MatchIntent, { type: 'UNDO' }>[]) {
  let state: MatchState = initialState();
  const events: MatchEvent[] = [];
  intents.forEach((intent, index) => {
    const result = applyEvent(state, intent, 1000 + index * 1000);
    events.push({ id: `e${index}`, matchId: 'm', sequence: index + 1, baseVersion: index, rulesetVersion: 'raidzon-v3', scorerSessionId: 's', createdAt: '', intent, components: result.components, summary: result.summary, before: state, after: result.state, syncStatus: 'PENDING' });
    state = result.state;
  });
  return { state, events };
}

describe('match summary', () => {
  it('picks standouts and team numbers, ignoring undone events', () => {
    const { state, events } = play([
      { type: 'START_RAID', raiderId: '0-0' },
      { type: 'RAID', raiderId: '0-0', outcome: 'TOUCH', defenderIds: ['1-0', '1-1', '1-2'], bonus: false },
      { type: 'START_RAID', raiderId: '1-3' },
      { type: 'RAID', raiderId: '1-3', outcome: 'TACKLE', defenderIds: [], tacklerId: '0-4', bonus: false },
      { type: 'TECHNICAL', side: 1 },
    ]);
    const undone: MatchEvent = { ...events[4], id: 'u', sequence: 6, intent: { type: 'UNDO', targetEventId: 'e4' }, components: [] };
    const summary = summarizeMatch(state, [...events, undone]);
    expect(summary.topRaider?.player.id).toBe('0-0');
    expect(summary.topDefender?.player.id).toBe('0-4');
    expect(summary.playerOfTheMatch?.player.id).toBe('0-0');
    expect(summary.teams[0]).toMatchObject({ raidPoints: 3, tacklePoints: 1, superRaids: 1, raids: 1, successfulRaids: 1 });
    expect(summary.teams[1]).toMatchObject({ raidPoints: 0, extraPoints: 0, raids: 1, successfulRaids: 0 });
  });
});

describe('milestones', () => {
  it('awards Super 10 for 10+ raid points and High 5 for 5+ tackle points', () => {
    expect(milestones({ raidPoints: 9, tacklePoints: 4 })).toEqual([]);
    expect(milestones({ raidPoints: 10, tacklePoints: 0 })).toEqual(['Super 10']);
    expect(milestones({ raidPoints: 2, tacklePoints: 5 })).toEqual(['High 5']);
    expect(milestones({ raidPoints: 12, tacklePoints: 6 })).toEqual(['Super 10', 'High 5']);
  });
});
