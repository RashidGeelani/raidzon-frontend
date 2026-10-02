import { afterEach, describe, expect, it, vi } from 'vitest';
import { liveSocketUrl, watchMatch, type LiveConnection } from './live-socket';

class FakeSocket {
  static last: FakeSocket;
  onopen?: () => void; onmessage?: (event: { data: string }) => void; onclose?: () => void; onerror?: () => void;
  closed = false;
  constructor(public url: string) { FakeSocket.last = this; }
  close() { if (!this.closed) { this.closed = true; this.onclose?.(); } }
}
afterEach(() => vi.useRealTimers());

describe('live match socket', () => {
  it('builds ws/wss URLs from the API origin', () => {
    expect(liveSocketUrl('m1', 'https://api.example.com', 'https://app.example.com')).toBe('wss://api.example.com/ws/matches/m1');
    expect(liveSocketUrl('m1', '', 'http://127.0.0.1:4173')).toBe('ws://127.0.0.1:4173/ws/matches/m1');
  });
  it('shows pushed views, falls back to polling while disconnected, and reconnects', async () => {
    vi.useFakeTimers();
    const views: number[] = [];
    const states: LiveConnection[] = [];
    const fetchView = vi.fn(async () => ({ version: 99 }));
    const stop = watchMatch<{ version: number }>('m1', { onView: (v) => views.push(v.version), onUnavailable: () => views.push(-1), onConnection: (s) => states.push(s) },
      { WebSocketImpl: FakeSocket as unknown as typeof WebSocket, fetchView });
    const first = FakeSocket.last;
    first.onopen?.();
    first.onmessage?.({ data: JSON.stringify({ type: 'view', view: { version: 3 } }) });
    first.onmessage?.({ data: JSON.stringify({ type: 'keepalive' }) });
    expect(views).toEqual([3]);
    expect(states.at(-1)).toBe('live');
    expect(fetchView).not.toHaveBeenCalled();
    first.close();
    expect(states.at(-1)).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchView).toHaveBeenCalledTimes(1);
    expect(views).toEqual([3, 99]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeSocket.last).not.toBe(first);
    FakeSocket.last.onopen?.();
    expect(states.at(-1)).toBe('live');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchView).toHaveBeenCalledTimes(1);
    FakeSocket.last.onmessage?.({ data: JSON.stringify({ type: 'unavailable' }) });
    expect(views.at(-1)).toBe(-1);
    stop();
  });
  it('reconnects when the connection goes silent', async () => {
    vi.useFakeTimers();
    const stop = watchMatch('m2', { onView: () => {}, onUnavailable: () => {}, onConnection: () => {} },
      { WebSocketImpl: FakeSocket as unknown as typeof WebSocket, fetchView: async () => ({}) });
    const first = FakeSocket.last;
    first.onopen?.();
    await vi.advanceTimersByTimeAsync(71_000);
    expect(first.closed).toBe(true);
    stop();
  });
});
