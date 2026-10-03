import { useEffect, useState } from 'react';
import { api } from '../features/identity/data/auth-client';
import { restoreSession } from '../features/identity/data/session-store';

const NAME_KEY = 'raidzon.profileName';
const readName = () => {
  try {
    return localStorage.getItem(NAME_KEY);
  } catch {
    return null;
  }
};
const writeName = (name: string | null) => {
  try {
    if (name) localStorage.setItem(NAME_KEY, name);
    else localStorage.removeItem(NAME_KEY);
  } catch {
    /* private mode */
  }
};
export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

/**
 * The Profile button: the player's initials when signed in, a person outline for guests.
 * The name is remembered on this phone so the avatar still shows offline.
 */
export function ProfileAvatar({ online, refreshKey }: { online: boolean; refreshKey: unknown }) {
  const [name, setName] = useState<string | null>(readName);
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let active = true;
    void restoreSession()
      .catch(() => null)
      .then(async (account) => {
        if (!active) return;
        setSignedIn(!!account);
        if (!account) {
          setName(null);
          writeName(null);
          return;
        }
        if (!online) return;
        try {
          const dashboard = await api<{ playerProfile?: { name?: string | null } | null }>(
            '/account/dashboard',
            undefined,
            account.token,
          );
          const next = dashboard?.playerProfile?.name?.trim() || null;
          if (active && next) {
            setName(next);
            writeName(next);
          }
        } catch {
          /* keep the remembered name */
        }
      });
    return () => {
      active = false;
    };
  }, [online, refreshKey]);
  if (signedIn && name)
    return (
      <span className="avatar avatar-initials" aria-hidden="true">
        {initialsOf(name)}
      </span>
    );
  return (
    <span className={`avatar ${signedIn ? 'avatar-initials' : 'avatar-guest'}`} aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      >
        <circle cx="12" cy="8.5" r="3.6" />
        <path d="M4.8 19.6c1.3-3.3 4-5 7.2-5s5.9 1.7 7.2 5" />
      </svg>
    </span>
  );
}
