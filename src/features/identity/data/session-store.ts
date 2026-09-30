import { db } from '../../matches/data/match-repository';
import { api, ApiError, type AccountSession } from './auth-client';
const sessionKey = 'account-session';
export async function saveSession(session: AccountSession) {
  await db.metadata.bulkPut([
    { key: sessionKey, value: JSON.stringify(session) },
    { key: 'scoring-account', value: session.accountId },
  ]);
}

export async function restoreSession(): Promise<AccountSession | null> {
  const saved = await db.metadata.get(sessionKey);
  if (!saved) return null;
  try {
    const value = JSON.parse(saved.value) as AccountSession;
    if (
      typeof value.token === 'string' &&
      /^[A-Za-z0-9_-]{43}$/.test(value.token) &&
      typeof value.accountId === 'string' &&
      typeof value.deviceId === 'string' &&
      value.expiresAt > Date.now()
    )
      return value;
  } catch {
    /* Invalid local session must not prevent guest scoring. */
  }
  await db.metadata.delete(sessionKey);
  return null;
}
export async function clearSession(session?: AccountSession) {
  await db.transaction('rw', db.metadata, async () => {
    if (session)
      await db.metadata.put({ key: `logout:${session.token}`, value: JSON.stringify(session) });
    await db.metadata.delete(sessionKey);
    if (session) await db.metadata.delete('scoring-account');
    if (session) await db.metadata.delete(`upcoming-fixtures:${session.accountId}`);
  });
}
export async function flushLogouts() {
  for (const row of await db.metadata.where('key').startsWith('logout:').toArray()) {
    const session = JSON.parse(row.value) as AccountSession;
    try {
      if (session.expiresAt > Date.now()) await api('/auth/logout', {}, session.token);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) throw error;
    }
    await db.metadata.delete(row.key);
  }
}
