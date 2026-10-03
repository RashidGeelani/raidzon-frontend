import { api, type AccountSession } from '../identity/data/auth-client';

export type NotificationKind = 'JOIN_REQUEST_RECEIVED' | 'JOIN_REQUEST_WITHDRAWN' | 'JOIN_REQUEST_APPROVED' | 'JOIN_REQUEST_REJECTED';
export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  tournamentId: string | null;
  teamId: string | null;
  createdAt: string;
  read: boolean;
}
export interface Inbox {
  unread: number;
  items: AppNotification[];
}
/** Where a tapped notification should take the user. nonce makes repeated taps re-trigger. */
export interface Focus {
  tournamentId?: string;
  /** 'public' opens the read-only tournament page instead of the organizer dashboard. */
  view?: 'public';
  teamId?: string;
  nonce: number;
}

export const fetchInbox = (account: AccountSession) => api<Inbox>('/account/notifications', undefined, account.token);
export const markRead = (account: AccountSession, ids: string[]) =>
  api<Inbox>('/account/notifications/read', { ids, all: false }, account.token);
export const markAllRead = (account: AccountSession) =>
  api<Inbox>('/account/notifications/read', { ids: [], all: true }, account.token);

/** Organizer alerts open the tournament; team decisions open the team. */
export function focusFor(item: AppNotification, nonce: number): Focus | null {
  if ((item.kind === 'JOIN_REQUEST_APPROVED' || item.kind === 'JOIN_REQUEST_REJECTED') && item.teamId) return { teamId: item.teamId, nonce };
  if (item.tournamentId) return { tournamentId: item.tournamentId, nonce };
  return null;
}

export function isInbox(value: unknown): value is Inbox {
  return !!value && typeof value === 'object' && Array.isArray((value as Inbox).items) && typeof (value as Inbox).unread === 'number';
}

export function timeAgo(iso: string, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** Window event that opens the notification panel from anywhere (e.g. the profile menu). */
export const OPEN_NOTIFICATIONS = 'raidzon:open-notifications';
