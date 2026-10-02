import { isScorable } from '../../scoring/domain/match-types';
import { db, type RaidzOnDatabase } from '../../matches/data/match-repository';
import type { AccountSession } from './auth-client';
import type { LocalMatch } from '../../scoring/domain/match-types';

export function isClaimableGuest(match: LocalMatch, session: AccountSession) {
  return (
    !match.localAccountId &&
    !match.serverAccountId &&
    !match.scoringDelegated &&
    match.ownerSessionId === session.deviceId &&
    isScorable(match.rulesetVersion)
  );
}

export async function claimGuestMatches(
  ids: string[],
  session: AccountSession,
  database: RaidzOnDatabase = db,
) {
  if (!ids.length) throw new Error('Select at least one guest match.');
  await database.transaction('rw', database.metadata, database.matches, async () => {
    const stored = await database.metadata.get('account-session');
    const current = stored ? (JSON.parse(stored.value) as AccountSession) : null;
    if (
      !current ||
      current.accountId !== session.accountId ||
      current.deviceId !== session.deviceId ||
      current.token !== session.token ||
      current.expiresAt <= Date.now()
    )
      throw new Error('Sign in again before claiming guest matches.');
    const matches = await database.matches.bulkGet([...new Set(ids)]);
    if (matches.some((match) => !match || !isClaimableGuest(match, session)))
      throw new Error(
        'A selected match changed or belongs to another account. Review the list again.',
      );
    for (const match of matches)
      await database.matches.update(match!.id, { localAccountId: session.accountId });
  });
}

export async function claimDeviceGuestMatches(
  session: AccountSession,
  database: RaidzOnDatabase = db,
) {
  const ids = (await database.matches.toArray())
    .filter((match) => isClaimableGuest(match, session))
    .map((match) => match.id);
  if (ids.length) await claimGuestMatches(ids, session, database);
  return ids.length;
}
