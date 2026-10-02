import { describe, expect, it, vi } from 'vitest';
import { raidWarning, raidWarningTracker } from './raid-warning';

describe('raid warning', () => {
  it('turns red at 10 seconds or less only while a raid is running', () => {
    expect(raidWarning(10_001, true)).toBe(false);
    expect(raidWarning(10_000, true)).toBe(true);
    expect(raidWarning(0, true)).toBe(true);
    expect(raidWarning(5_000, false)).toBe(false);
  });
  it('beeps once per raid when the clock crosses 10 seconds', () => {
    const warn = vi.fn();
    const see = raidWarningTracker(warn);
    see('r1', 30_000);
    see('r1', 12_000);
    expect(warn).not.toHaveBeenCalled();
    see('r1', 10_000);
    see('r1', 9_000);
    see('r1', 1_000);
    expect(warn).toHaveBeenCalledTimes(1);
    see(null, 30_000);
    see('r2', 30_000);
    see('r2', 8_000);
    expect(warn).toHaveBeenCalledTimes(2);
    // Opening the screen mid-raid with under 10 seconds left does not beep.
    see('r3', 6_000);
    see('r3', 5_000);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
