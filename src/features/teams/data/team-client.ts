import { api, type AccountSession } from '../../identity/data/auth-client';
import { db, type RaidzOnDatabase, type TeamInput } from '../../matches/data/match-repository';
import {
  MATCH_SUBSTITUTES,
  MAX_SQUAD,
  RECOMMENDED_PLAYERS,
  REQUIRED_PLAYERS,
  type PlayingRole,
  type TeamDetail,
  type TeamMember,
  type TeamSummary,
} from './team-types';

export * from './team-types';

export async function cacheTeam(accountId: string, detail: TeamDetail, database: RaidzOnDatabase = db) {
  await database.teams.put({ id: detail.id, accountId, detail, savedAt: Date.now() });
  return detail;
}
/** Squads this account can use for a lineup, available offline. Archived teams are excluded. */
export async function cachedTeams(accountId: string, database: RaidzOnDatabase = db) {
  const rows = await database.teams.where('accountId').equals(accountId).toArray();
  return rows
    .map((row) => row.detail)
    .filter((team) => !team.archived)
    .sort((a, b) => a.name.localeCompare(b.name));
}
export async function forgetTeams(accountId: string, database: RaidzOnDatabase = db) {
  await database.teams.where('accountId').equals(accountId).delete();
}

export const listTeams = (account: AccountSession) => api<TeamSummary[]>('/teams', undefined, account.token);

async function saved(account: AccountSession, request: Promise<TeamDetail>) {
  return cacheTeam(account.accountId, await request);
}
export const getTeam = (account: AccountSession, id: string) =>
  saved(account, api<TeamDetail>(`/teams/${id}`, undefined, account.token));
export const createTeam = (account: AccountSession, name: string, city: string) =>
  saved(account, api<TeamDetail>('/teams', { id: crypto.randomUUID(), name, city: city || null }, account.token));
export const updateTeamDetails = (account: AccountSession, id: string, name: string, city: string) =>
  saved(account, api<TeamDetail>(`/teams/${id}/details`, { name, city: city || null }, account.token));
export const archiveTeam = (account: AccountSession, id: string) =>
  saved(account, api<TeamDetail>(`/teams/${id}/archive`, {}, account.token));
export const addMember = (
  account: AccountSession,
  id: string,
  member: { name: string; phone: string; jersey: number | null; playingRole: PlayingRole | null },
) => saved(account, api<TeamDetail>(`/teams/${id}/members`, { id: crypto.randomUUID(), ...member }, account.token));
export const editMember = (
  account: AccountSession,
  id: string,
  memberId: string,
  member: { name: string; jersey: number | null; playingRole: PlayingRole | null },
) => saved(account, api<TeamDetail>(`/teams/${id}/members/${memberId}`, member, account.token));
export const removeMember = (account: AccountSession, id: string, memberId: string) =>
  saved(account, api<TeamDetail>(`/teams/${id}/members/${memberId}/remove`, {}, account.token));
export const setLeadership = (
  account: AccountSession,
  id: string,
  captainMemberId: string | null,
  viceCaptainMemberId: string | null,
) => saved(account, api<TeamDetail>(`/teams/${id}/leadership`, { captainMemberId, viceCaptainMemberId }, account.token));
export const addStaff = (account: AccountSession, id: string, staff: { name: string; phone: string; role: 'MANAGER' | 'COACH' }) =>
  saved(account, api<TeamDetail>(`/teams/${id}/staff`, staff, account.token));
export const removeStaff = (account: AccountSession, id: string, profileId: string, role: 'MANAGER' | 'COACH') =>
  saved(account, api<TeamDetail>(`/teams/${id}/staff/remove`, { profileId, role }, account.token));

/** Refreshes every active squad this account can use, so match setup works offline later. */
export async function refreshTeamCache(account: AccountSession, database: RaidzOnDatabase = db) {
  const summaries = await listTeams(account);
  const active = summaries.filter((team) => !team.archived).slice(0, 30);
  const details = await Promise.all(active.map((team) => api<TeamDetail>(`/teams/${team.id}`, undefined, account.token)));
  const keep = new Set(details.map((team) => team.id));
  await database.transaction('rw', database.teams, () =>
    database.teams
      .where('accountId')
      .equals(account.accountId)
      .toArray()
      .then((rows) => database.teams.bulkDelete(rows.filter((row) => !keep.has(row.id)).map((row) => row.id)))
      .then(() =>
        database.teams.bulkPut(details.map((detail) => ({ id: detail.id, accountId: account.accountId, detail, savedAt: Date.now() }))),
      ),
  );
  return summaries;
}

export function squadStatus(size: number) {
  return {
    size,
    requiredMet: size >= REQUIRED_PLAYERS,
    recommendedMet: size >= RECOMMENDED_PLAYERS,
    full: size >= MAX_SQUAD,
    label:
      `${Math.min(size, REQUIRED_PLAYERS)}/${REQUIRED_PLAYERS} required${size >= REQUIRED_PLAYERS ? ' ✓' : ''}` +
      ` · ${Math.min(size, RECOMMENDED_PLAYERS)}/${RECOMMENDED_PLAYERS} recommended` +
      ` · ${size}/${MAX_SQUAD} squad`,
  };
}

export type LineupSlot = 'STARTER' | 'SUB' | 'OUT';
/** Anyone who can be picked for a match: a saved-squad member or a tournament roster entry. */
export type LineupMember = Pick<TeamMember, 'id' | 'name' | 'phone'> & Partial<Pick<TeamMember, 'jersey' | 'leadership'>>;
/** Tournament roster entries have no member IDs; the phone is unique within a roster. */
export const rosterMembers = (roster: { name: string; phone: string; jersey?: number | null }[]): LineupMember[] =>
  roster.map((player) => ({ id: player.phone, name: player.name, phone: player.phone, jersey: player.jersey ?? null }));
/** Default match-day lineup: captain and vice-captain first, then squad order; 7 starters, up to 5 subs. */
export function defaultLineup(members: LineupMember[]): Record<string, LineupSlot> {
  const ordered = [...members].sort((a, b) => rank(a) - rank(b));
  return Object.fromEntries(
    ordered.map((member, index) => [
      member.id,
      index < REQUIRED_PLAYERS ? 'STARTER' : index < REQUIRED_PLAYERS + MATCH_SUBSTITUTES ? 'SUB' : 'OUT',
    ]),
  );
}
const rank = (member: LineupMember) => (member.leadership === 'CAPTAIN' ? 0 : member.leadership === 'VICE_CAPTAIN' ? 1 : 2);

export function lineupProblem(lineup: Record<string, LineupSlot>) {
  const slots = Object.values(lineup);
  const starters = slots.filter((slot) => slot === 'STARTER').length;
  const subs = slots.filter((slot) => slot === 'SUB').length;
  if (starters !== REQUIRED_PLAYERS) return `Pick exactly ${REQUIRED_PLAYERS} starters (${starters} selected).`;
  if (subs > MATCH_SUBSTITUTES) return `Pick up to ${MATCH_SUBSTITUTES} substitutes (${subs} selected).`;
  return null;
}

/** Turns a squad and lineup into match setup input: starters first, then substitutes, in squad order. */
export function lineupToTeamInput(team: { name: string; members: LineupMember[] }, lineup: Record<string, LineupSlot>): TeamInput {
  const problem = lineupProblem(lineup);
  if (problem) throw new Error(problem);
  const pick = (slot: LineupSlot) =>
    team.members
      .filter((member) => lineup[member.id] === slot)
      .map((member) => ({ name: member.name, phone: member.phone, jersey: member.jersey == null ? '' : String(member.jersey) }));
  return { name: team.name, players: [...pick('STARTER'), ...pick('SUB')] };
}
