import { describe, expect, it } from 'vitest';
import { sharedRanks } from './rank';
import { eventLabel, plural } from './event-label';

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
