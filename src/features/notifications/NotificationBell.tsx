import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccountSession } from '../identity/data/auth-client';
import { restoreSession } from '../identity/data/session-store';
import { fetchInbox, focusFor, isInbox, markAllRead, markRead, timeAgo, type AppNotification, type Focus, type Inbox } from './notification-client';

const POLL_MS = 60_000;

/** In-app alerts (no SMS/WhatsApp). Polls while online and when the app regains focus. */
export function NotificationBell({ online, onOpen }: { online: boolean; onOpen: (focus: Focus) => void }) {
  const [account, setAccount] = useState<AccountSession | null>(null);
  const [inbox, setInbox] = useState<Inbox>({ unread: 0, items: [] });
  const [open, setOpen] = useState(false);
  const nonce = useRef(0);

  const refresh = useCallback(async () => {
    const session = await restoreSession().catch(() => null);
    setAccount(session);
    if (!session) { setInbox({ unread: 0, items: [] }); return; }
    if (!navigator.onLine) return;
    const result = await fetchInbox(session).catch(() => null);
    if (isInbox(result)) setInbox(result);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [refresh, online]);

  if (!account) return null;
  async function openItem(item: AppNotification) {
    if (!account) return;
    setOpen(false);
    if (!item.read) {
      setInbox((current) => ({ unread: Math.max(0, current.unread - 1), items: current.items.map((n) => (n.id === item.id ? { ...n, read: true } : n)) }));
      void markRead(account, [item.id]).then((result) => isInbox(result) && setInbox(result)).catch(() => undefined);
    }
    const focus = focusFor(item, ++nonce.current);
    if (focus) onOpen(focus);
  }
  return (
    <div className="notification-bell">
      <button
        type="button"
        className="bell-button"
        aria-label={inbox.unread ? `Notifications, ${inbox.unread} unread` : 'Notifications'}
        aria-expanded={open}
        onClick={() => { setOpen((value) => !value); if (!open) void refresh(); }}
      >
        <span aria-hidden="true">🔔</span>
        {inbox.unread > 0 && <b className="bell-badge" aria-hidden="true">{inbox.unread > 9 ? '9+' : inbox.unread}</b>}
      </button>
      {open && (
        <div className="notification-panel" role="dialog" aria-label="Notifications">
          <header>
            <strong>Notifications</strong>
            {inbox.unread > 0 && (
              <button type="button" className="quiet" disabled={!online}
                onClick={() => void markAllRead(account).then((result) => isInbox(result) && setInbox(result)).catch(() => undefined)}>
                Mark all read
              </button>
            )}
          </header>
          {!online && <p className="field-note">Offline: showing alerts from your last connection.</p>}
          {inbox.items.length === 0 ? (
            <p className="field-note">No notifications yet. Team requests and decisions will appear here.</p>
          ) : (
            <ul>
              {inbox.items.map((item) => (
                <li key={item.id}>
                  <button type="button" className={`notification-item ${item.read ? '' : 'unread'}`} onClick={() => void openItem(item)}>
                    <strong>{item.title}</strong>
                    {item.body && <span>{item.body}</span>}
                    <small>{timeAgo(item.createdAt)}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
