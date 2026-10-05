import { afterEach, expect, it, vi } from 'vitest';
import { matchNow, notBefore } from './match-clock';

afterEach(() => vi.restoreAllMocks());

it('keeps counting when the phone clock is corrected backwards', () => {
  const before = matchNow();
  vi.spyOn(Date, 'now').mockReturnValue(before - 180_000); // clock pulled back 3 minutes
  expect(matchNow()).toBeGreaterThanOrEqual(before);
});

it('never runs behind a time that was already recorded', () => {
  const recorded = Date.now() + 60_000; // recorded while the clock was fast
  notBefore(recorded);
  expect(matchNow()).toBeGreaterThanOrEqual(recorded);
  expect(Number.isInteger(matchNow())).toBe(true);
});
