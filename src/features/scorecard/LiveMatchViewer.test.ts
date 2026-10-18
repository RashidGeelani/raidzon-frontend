import { describe, expect, it } from 'vitest';
import { eventPoints, teamTotals } from './LiveMatchViewer';

describe('eventPoints', () => {
  const teams = [{ name: 'Tigers' }, { name: 'Lions' }];
  it('sums each side and skips sides that scored nothing', () => {
    expect(eventPoints([{ kind: 'TOUCH', side: 0, points: 2 }, { kind: 'BONUS', side: 0, points: 1 }], teams)).toBe('Tigers +3');
    expect(eventPoints([{ kind: 'TOUCH', side: 0, points: 1 }, { kind: 'ALL_OUT', side: 1, points: 2 }], teams)).toBe('Tigers +1 · Lions +2');
    expect(eventPoints(null, teams)).toBe('');
  });
});

describe('teamTotals', () => {
  it('splits points by kind and counts scoring raids', () => {
    const events = [
      { type: 'RAID', components: [{ kind: 'TOUCH', side: 0, points: 2 }, { kind: 'BONUS', side: 0, points: 1 }, { kind: 'ALL_OUT', side: 0, points: 2 }] },
      { type: 'RAID', components: [{ kind: 'TACKLE', side: 0, points: 1 }, { kind: 'SUPER_TACKLE_EXTRA', side: 0, points: 1 }] },
      { type: 'RAID', components: [] },
      { type: 'TECHNICAL', components: [{ kind: 'TECHNICAL', side: 0, points: 1 }] },
    ] as const;
    expect(teamTotals(events.map((e) => ({ ...e, components: [...e.components] })), 0)).toEqual({ raid: 3, tackle: 2, allOut: 2, extras: 1, successfulRaids: 1 });
  });
});
