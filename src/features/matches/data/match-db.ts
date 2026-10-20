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
  }
}
export const db = new RaidzOnDatabase();
