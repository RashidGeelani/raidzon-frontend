// The device's offline database. Kept apart from match-repository so pages that only need the
// signed-in session (public match, tournament and player pages) don't load the scoring engine.
import Dexie, { type Table } from 'dexie';
import type { LocalMatch, MatchEvent } from '../../scoring/domain/match-types';
import type { TeamDetail } from '../../teams/data/team-types';

export interface CachedTeam {
  id: string;
  accountId: string;
  detail: TeamDetail;
  savedAt: number;
}
export interface LocalPlayer {
  id: string;
  phone: string;
  name: string;
  /** Account ID (or GUEST) whose match setup saved this player; suggestions never cross accounts. */
  owner?: string;
}
export const GUEST = 'guest';
/** Who saved players belong to right now: the signed-in account, otherwise the guest. */
export async function playerOwner(database: RaidzOnDatabase) {
  const [session, account] = await Promise.all([database.metadata.get('account-session'), database.metadata.get('scoring-account')]);
  return session && account ? account.value : GUEST;
}
export class RaidzOnDatabase extends Dexie {
  matches!: Table<LocalMatch, string>;
  events!: Table<MatchEvent, string>;
  players!: Table<LocalPlayer, string>;
  metadata!: Table<{ key: string; value: string }, string>;
  teams!: Table<CachedTeam, string>;
  constructor(name = 'raidzon') {
    super(name);
    this.version(1).stores({
      matches: 'id, updatedAt',
      events: 'id, matchId, &[matchId+sequence]',
      players: 'id, &phone',
      metadata: 'key',
    });
    // Saved squads cached per account so a lineup can be picked offline.
    this.version(2).stores({ teams: 'id, accountId' });
    // Saved players (phone suggestions) belong to one account or the guest; existing ones go to whoever is signed in.
    this.version(3)
      .stores({ players: 'id, &[owner+phone], owner' })
      .upgrade((tx) =>
        Dexie.Promise.all([tx.table('metadata').get('account-session'), tx.table('metadata').get('scoring-account')]).then(
          ([session, account]) => tx.table('players').toCollection().modify({ owner: session && account ? account.value : GUEST }),
        ),
      );
  }
}
export const db = new RaidzOnDatabase();
