import { describe, expect, it } from 'vitest';
import { sharedRanks } from './rank';
import { eventLabel, plural, raidDetail } from './event-label';

describe('sharedRanks', () => {
  it('gives ties the same rank and skips the next', () => {
    expect(sharedRanks([10, 10, 7, 7, 7, 2], (n) => n)).toEqual([1, 1, 3, 3, 3, 6]);
  });
  it('handles an empty list', () => {
    expect(sharedRanks([], (n: number) => n)).toEqual([]);
  });
});

describe('eventLabel', () => {
  it('turns stored summaries into readable lines', () => {
    expect(eventLabel('end half')).toBe('Half-time');
    expect(eventLabel('Star 1: touch')).toBe('Star 1 · successful raid');
    expect(eventLabel('Star 1: empty + bonus')).toBe('Star 1 · empty raid + bonus');
    expect(eventLabel('substitution')).toBe('Substitution');
  });
  it('pluralises', () => {
    expect(plural(1, 'event')).toBe('1 event');
    expect(plural(3, 'event')).toBe('3 events');
  });
});

describe('raidDetail', () => {
  const names: Record<string, string> = { j: 'Jafar' };
  const nameOf = (id: string) => names[id];
  it('tells the whole raid', () => {
    expect(raidDetail('Waseem: touch + bonus · Super Raid', [{ kind: 'TOUCH', points: 2, playerId: 'w' }, { kind: 'BONUS', points: 1, playerId: 'w' }], nameOf))
      .toBe('Waseem · successful raid · 2 touches + bonus · Super Raid');
    expect(raidDetail('Waseem: tackle · Super Tackle', [{ kind: 'TACKLE', points: 1, playerId: 'j' }, { kind: 'SUPER_TACKLE_EXTRA', points: 1 }], nameOf))
      .toBe('Waseem · unsuccessful raid · tackled by Jafar · Super Tackle');
    expect(raidDetail('Waseem: self out', [{ kind: 'SELF_OUT', points: 1 }], nameOf)).toBe('Waseem · self-out');
    expect(raidDetail('Waseem: empty', [], nameOf)).toBe('Waseem · empty raid');
    expect(raidDetail('Waseem: empty + bonus', [{ kind: 'BONUS', points: 1 }], nameOf)).toBe('Waseem · successful raid · bonus');
    expect(raidDetail('Waseem: touch', [{ kind: 'TOUCH', points: 1 }, { kind: 'ALL_OUT', points: 2 }], nameOf)).toBe('Waseem · successful raid · 1 touch · All Out');
    expect(raidDetail('end half', [], nameOf)).toBe('Half-time');
    const more = (id: string) => ({ b: 'Bilal', d: 'Danish', o: 'Owais' })[id];
    expect(raidDetail('Waseem: touch · 1 defender self-out', [{ kind: 'TOUCH', points: 2 }, { kind: 'SELF_OUT', points: 1 }], more, { touchedIds: ['b', 'd'], selfOutIds: ['o'] }))
      .toBe('Waseem · successful raid · 2 touches (Bilal, Danish) · Owais self-out');
  });
});
