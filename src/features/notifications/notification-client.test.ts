import { describe, expect, it } from 'vitest';
import { focusFor, isInbox, timeAgo, type AppNotification } from './notification-client';

const item = (kind: AppNotification['kind']): AppNotification => ({
  id: 'n', kind, title: 't', body: null, tournamentId: 'cup', teamId: 'tigers', createdAt: '2026-10-02T10:00:00Z', read: false,
});

describe('notifications', () => {
  it('sends organizers to the tournament and teams to their team', () => {
    expect(focusFor(item('JOIN_REQUEST_RECEIVED'), 1)).toEqual({ tournamentId: 'cup', nonce: 1 });
    expect(focusFor(item('JOIN_REQUEST_WITHDRAWN'), 2)).toEqual({ tournamentId: 'cup', nonce: 2 });
    expect(focusFor(item('JOIN_REQUEST_APPROVED'), 3)).toEqual({ teamId: 'tigers', nonce: 3 });
    expect(focusFor(item('JOIN_REQUEST_REJECTED'), 4)).toEqual({ teamId: 'tigers', nonce: 4 });
  });
  it('ignores malformed inbox responses', () => {
    expect(isInbox({})).toBe(false);
    expect(isInbox(null)).toBe(false);
    expect(isInbox({ unread: 1, items: [] })).toBe(true);
  });
  it('formats relative times', () => {
    const now = Date.parse('2026-10-02T12:00:00Z');
    expect(timeAgo('2026-10-02T11:59:30Z', now)).toBe('just now');
    expect(timeAgo('2026-10-02T11:45:00Z', now)).toBe('15 min ago');
    expect(timeAgo('2026-10-02T09:00:00Z', now)).toBe('3 h ago');
    expect(timeAgo('2026-10-01T10:00:00Z', now)).toBe('yesterday');
    expect(timeAgo('2026-09-28T12:00:00Z', now)).toBe('4 days ago');
  });
});
