import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RaidzOnDatabase, createMatch } from '../../matches/data/match-repository';
import {
  cacheTeam,
  cachedTeams,
  defaultLineup,
  forgetTeams,
  lineupProblem,
  lineupToTeamInput,
  rosterMembers,
  squadStatus,
  type TeamDetail,
  type TeamMember,
} from './team-client';

const member = (i: number, leadership: TeamMember['leadership'] = null): TeamMember => ({
  id: `m${i}`,
  profileId: `p${i}`,
  name: `Player ${i}`,
  squadName: `Player ${i}`,
  phone: `+9191000000${String(i).padStart(2, '0')}`,
  jersey: i,
  playingRole: null,
  leadership,
  claimed: false,
});
const team = (size: number, id = 't1', archived = false): TeamDetail => ({
  id,
  name: `Team ${id}`,
  city: null,
  archived,
  revision: 0,
  myRole: 'OWNER',
  ownerName: null,
  members: Array.from({ length: size }, (_, i) => member(i, i === 9 ? 'CAPTAIN' : null)),
  staff: [],
});

describe('squad status', () => {
  it('reports required, recommended and maximum squad sizes', () => {
    expect(squadStatus(5)).toMatchObject({ requiredMet: false, recommendedMet: false, full: false });
    expect(squadStatus(5).label).toBe('5/7 required · 5/12 recommended · 5/20 squad');
    expect(squadStatus(12)).toMatchObject({ requiredMet: true, recommendedMet: true, full: false });
    expect(squadStatus(12).label).toBe('7/7 required ✓ · 12/12 recommended · 12/20 squad');
    expect(squadStatus(20).full).toBe(true);
  });
});

describe('match-day lineup', () => {
  it('defaults to 7 starters and 5 substitutes with the captain starting', () => {
    const lineup = defaultLineup(team(20).members);
    const values = Object.values(lineup);
    expect(values.filter((slot) => slot === 'STARTER')).toHaveLength(7);
    expect(values.filter((slot) => slot === 'SUB')).toHaveLength(5);
    expect(values.filter((slot) => slot === 'OUT')).toHaveLength(8);
    expect(lineup.m9).toBe('STARTER');
    expect(lineupProblem(lineup)).toBeNull();
  });
  it('rejects lineups without exactly seven starters or with too many substitutes', () => {
    const lineup = defaultLineup(team(20).members);
    expect(lineupProblem({ ...lineup, m0: 'OUT' })).toMatch(/exactly 7 starters/);
    const tooMany = Object.fromEntries(Object.keys(lineup).map((id, i) => [id, i < 7 ? 'STARTER' : 'SUB'])) as typeof lineup;
    expect(lineupProblem(tooMany)).toMatch(/up to 5 substitutes/);
  });
  it('builds match setup input with starters first and leaves out non-playing members', () => {
    const squad = team(14);
    const lineup = defaultLineup(squad.members);
    lineup.m0 = 'SUB';
    lineup.m12 = 'STARTER';
    lineup.m11 = 'OUT';
    const input = lineupToTeamInput(squad, lineup);
    expect(input.name).toBe('Team t1');
    expect(input.players).toHaveLength(12);
    expect(input.players.slice(0, 7).map((p) => p.name)).toContain('Player 12');
    expect(input.players.slice(7).map((p) => p.name)).toContain('Player 0');
    expect(input.players.map((p) => p.name)).not.toContain('Player 13');
  });
});

describe('tournament roster lineup', () => {
  it('turns a 20-player tournament roster into a legal 12-player match team in roster order', () => {
    const roster = Array.from({ length: 20 }, (_, i) => ({ name: `R${i}`, phone: `+9193000000${String(i).padStart(2, '0')}` }));
    const members = rosterMembers(roster);
    const input = lineupToTeamInput({ name: 'Raiders', members }, defaultLineup(members));
    expect(input.players).toHaveLength(12);
    expect(input.players[0]).toEqual({ name: 'R0', phone: '+919300000000' });
    expect(input.players.map((p) => p.name)).not.toContain('R12');
  });
});

describe('offline squad cache', () => {
  let database: RaidzOnDatabase;
  beforeEach(() => {
    database = new RaidzOnDatabase(`teams-${crypto.randomUUID()}`);
  });
  afterEach(async () => {
    await database.delete();
  });
  it('keeps squads per account, hides archived teams and forgets them on sign-out', async () => {
    await cacheTeam('a1', team(8, 'b'), database);
    await cacheTeam('a1', team(8, 'a'), database);
    await cacheTeam('a1', team(8, 'z', true), database);
    await cacheTeam('a2', team(8, 'other'), database);
    expect((await cachedTeams('a1', database)).map((t) => t.id)).toEqual(['a', 'b']);
    await forgetTeams('a1', database);
    expect(await cachedTeams('a1', database)).toEqual([]);
    expect(await cachedTeams('a2', database)).toHaveLength(1);
  });
  it('produces a lineup the existing match setup accepts', async () => {
    const a = lineupToTeamInput(team(12, 'a'), defaultLineup(team(12, 'a').members));
    const other = team(12, 'b');
    other.members = other.members.map((m, i) => ({ ...m, id: `x${i}`, phone: `+9192000000${String(i).padStart(2, '0')}` }));
    const b = lineupToTeamInput(other, defaultLineup(other.members));
    const match = await createMatch({ teams: [a, b], firstTurn: 0, halfMinutes: 20, raidSeconds: 30 }, 'session-1', database);
    expect(match.state.teams[0].players.filter((p) => p.status === 'ACTIVE')).toHaveLength(7);
    expect(match.state.teams[0].players.filter((p) => p.status === 'BENCH')).toHaveLength(5);
  });
});
