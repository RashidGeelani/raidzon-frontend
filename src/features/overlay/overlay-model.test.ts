import { afterEach, describe, expect, it, vi } from 'vitest';
import { clockText, delayQueue, matCount, overlayDelayMs, overlayLink, overlayPhase, teamCode } from './overlay-model';

describe('overlayDelayMs', () => {
  it('reads ?delay in seconds, capped at a minute', () => {
    expect(overlayDelayMs('?delay=10')).toBe(10_000);
    expect(overlayDelayMs('?delay=2.5')).toBe(2_500);
    expect(overlayDelayMs('?delay=600')).toBe(60_000);
  });
  it('treats a missing or invalid delay as none', () => {
    expect(overlayDelayMs('')).toBe(0);
    expect(overlayDelayMs('?delay=abc')).toBe(0);
    expect(overlayDelayMs('?delay=-5')).toBe(0);
  });
});

describe('overlayLink', () => {
  it('adds the delay only when there is one', () => {
    expect(overlayLink('https://raidzon.com', 'abc', 0)).toBe('https://raidzon.com/overlay/abc');
    expect(overlayLink('https://raidzon.com', 'abc', 10)).toBe('https://raidzon.com/overlay/abc?delay=10');
  });
});

describe('delayQueue', () => {
  afterEach(() => vi.useRealTimers());
  it('runs items straight away without a delay', () => {
    const seen: number[] = [];
    delayQueue<number>(0, (n) => seen.push(n)).push(1);
    expect(seen).toEqual([1]);
  });
  it('holds each item back by the delay, in arrival order', () => {
    vi.useFakeTimers();
    const seen: number[] = [];
    const queue = delayQueue<number>(10_000, (n) => seen.push(n));
    queue.push(1);
    vi.advanceTimersByTime(4_000);
    queue.push(2);
    vi.advanceTimersByTime(5_999);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual([1]);
    vi.advanceTimersByTime(4_000);
    expect(seen).toEqual([1, 2]);
  });
  it('drops waiting items when stopped', () => {
    vi.useFakeTimers();
    const seen: number[] = [];
    const queue = delayQueue<number>(5_000, (n) => seen.push(n));
    queue.push(1);
    queue.stop();
    vi.advanceTimersByTime(10_000);
    expect(seen).toEqual([]);
  });
});

describe('overlayPhase', () => {
  it('shows "starting soon" until the first raid starts', () => {
    expect(overlayPhase({ status: 'LIVE', currentRaiderId: null }, 0)).toBe('starting');
    expect(overlayPhase({ status: 'LIVE', currentRaiderId: 'p1' }, 0)).toBe('live');
    expect(overlayPhase({ status: 'LIVE', currentRaiderId: null }, 3)).toBe('live');
  });
  it('shows breaks and full time', () => {
    expect(overlayPhase({ status: 'HALF_TIME', currentRaiderId: null }, 20)).toBe('break');
    expect(overlayPhase({ status: 'PAUSED', currentRaiderId: 'p1' }, 4)).toBe('break');
    expect(overlayPhase({ status: 'COMPLETED', currentRaiderId: null }, 40)).toBe('final');
    expect(overlayPhase({ status: 'TIED', currentRaiderId: null }, 40)).toBe('live');
  });
});

describe('bar helpers', () => {
  it('counts players on mat, at most seven', () => {
    expect(matCount([{ status: 'ACTIVE' }, { status: 'OUT' }, { status: 'BENCH' }, { status: 'ACTIVE' }])).toBe(2);
    expect(matCount(Array.from({ length: 9 }, () => ({ status: 'ACTIVE' })))).toBe(7);
  });
  it('formats the half clock', () => {
    expect(clockText(0)).toBe('0:00');
    expect(clockText(605)).toBe('10:05');
  });
  it('makes a three-letter team code', () => {
    expect(teamCode('Bandipora Bulls')).toBe('BAN');
    expect(teamCode('S.K. Tigers')).toBe('SKT');
    expect(teamCode('...')).toBe('TBC');
  });
});
