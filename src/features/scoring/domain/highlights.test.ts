import { describe, expect, it } from 'vitest';
import { highlights, popFor } from './highlights';

describe('popFor', () => {
  const superRaid = [{ kind: 'TOUCH' as const, side: 0 as const, points: 3 }];
  it('pops each new event once; the scorer passes when it was recorded', () => {
    const seen = {};
    expect(popFor(seen, { id: 'a', components: superRaid, at: 1000 }, 2000)).toEqual([{ kind: 'SUPER_RAID', side: 0 }]);
    expect(popFor(seen, { id: 'a', components: superRaid, at: 1000 }, 2500)).toEqual([]);
  });
  it('Undo never replays: the undo has no components and the event it uncovers was already seen', () => {
    const seen = {};
    popFor(seen, { id: 'raid', components: superRaid, at: 1000 }, 1000);
    expect(popFor(seen, { id: 'undo', components: [], at: 2000 }, 2000)).toEqual([]);
    expect(popFor(seen, { id: 'raid', components: superRaid, at: 1000 }, 3000)).toEqual([]);
    // Scoring the raid again is a new event and pops.
    expect(popFor(seen, { id: 'redo', components: superRaid, at: 4000 }, 4000)).toHaveLength(1);
  });
  it('history does not pop: a fan joining mid-match, or a scorer reopening an old match', () => {
    const fan = {};
    expect(popFor(fan, { id: 'old', components: superRaid })).toEqual([]);
    expect(popFor(fan, { id: 'new', components: superRaid })).toHaveLength(1);
    expect(popFor({}, { id: 'old', components: superRaid, at: 0 }, 60_000)).toEqual([]);
  });
});

describe('highlights', () => {
  it('Super Raid needs 3 or more raider points (touches + bonus)', () => {
    expect(highlights([{ kind: 'TOUCH', side: 0, points: 2 }])).toEqual([]);
    expect(highlights([{ kind: 'TOUCH', side: 1, points: 2 }, { kind: 'BONUS', side: 1, points: 1 }])).toEqual([{ kind: 'SUPER_RAID', side: 1 }]);
    // Defender self-outs score for the raiding team but are not raider points.
    expect(highlights([{ kind: 'TOUCH', side: 0, points: 2 }, { kind: 'SELF_OUT', side: 0, points: 1 }])).toEqual([]);
  });
  it('Super Tackle, All Out and technical points come from their components', () => {
    expect(highlights([{ kind: 'TACKLE', side: 1, points: 1 }, { kind: 'SUPER_TACKLE_EXTRA', side: 1, points: 1 }])).toEqual([{ kind: 'SUPER_TACKLE', side: 1 }]);
    expect(highlights([{ kind: 'TOUCH', side: 0, points: 3 }, { kind: 'ALL_OUT', side: 0, points: 2 }])).toEqual([{ kind: 'SUPER_RAID', side: 0 }, { kind: 'ALL_OUT', side: 0 }]);
    expect(highlights([{ kind: 'TECHNICAL', side: 1, points: 1 }])).toEqual([{ kind: 'TECHNICAL', side: 1 }]);
  });
  it('plain raids, tackles and undo events have none', () => {
    expect(highlights([{ kind: 'TACKLE', side: 1, points: 1 }])).toEqual([]);
    expect(highlights([])).toEqual([]);
  });
});
