import { describe, expect, it } from 'vitest';
import { eventPoints } from './LiveMatchViewer';

describe('eventPoints', () => {
  const teams = [{ name: 'Tigers' }, { name: 'Lions' }];
  it('sums each side and skips sides that scored nothing', () => {
    expect(eventPoints([{ kind: 'TOUCH', side: 0, points: 2 }, { kind: 'BONUS', side: 0, points: 1 }], teams)).toBe('Tigers +3');
    expect(eventPoints([{ kind: 'TOUCH', side: 0, points: 1 }, { kind: 'ALL_OUT', side: 1, points: 2 }], teams)).toBe('Tigers +1 · Lions +2');
    expect(eventPoints(null, teams)).toBe('');
  });
});
