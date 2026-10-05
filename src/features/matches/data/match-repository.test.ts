import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  RaidzOnDatabase,
  createMatch,
  deleteLocalMatch,
  recentPlayers,
  recordEvent,
  sessionId,
  undoTarget,
  type SetupInput,
} from './match-repository';

let database: RaidzOnDatabase;
const setup = (): SetupInput => ({
  firstTurn: 0,
  halfMinutes: 20,
  raidSeconds: 30,
  teams: [0, 1].map((side) => ({
    name: `Team ${side}`,
    players: Array.from({ length: 7 }, (_, i) => ({
      name: `Player ${side}-${i}`,
      phone: `+9198765432${side}${i}`,
    })),
  })) as SetupInput['teams'],
});
beforeEach(() => {
  database = new RaidzOnDatabase(`test-${crypto.randomUUID()}`);
});
afterEach(async () => {
  await database.delete();
});

describe('deleting a match', () => {
  it('removes the match and its events from this phone', async () => {
    await database.metadata.put({ key: 'scoring-account', value: 'organizer' });
    const keep = await createMatch(setup(), 'session', database);
    const gone = await createMatch(setup(), 'session', database);
    await recordEvent(gone.id, 0, 'session', { type: 'TECHNICAL', side: 0 }, crypto.randomUUID(), database);
    await recordEvent(keep.id, 0, 'session', { type: 'TECHNICAL', side: 1 }, crypto.randomUUID(), database);
    await deleteLocalMatch(gone.id, database);
    expect(await database.matches.get(gone.id)).toBeUndefined();
    expect(await database.events.where('matchId').equals(gone.id).count()).toBe(0);
    expect(await database.events.where('matchId').equals(keep.id).count()).toBe(1);
  });
});

describe('practice matches', () => {
  it('marks a quick match with filled-in names as practice, but never a fixture match', async () => {
    expect((await createMatch({ ...setup(), practice: true }, 'session', database)).practice).toBe(true);
    expect((await createMatch(setup(), 'session', database)).practice).toBeUndefined();
    const fixture = await createMatch(
      { ...setup(), practice: true, fixtureRef: { tournamentId: 't', fixtureId: 'f' } },
      'session',
      database,
    );
    expect(fixture.practice).toBeUndefined();
  });
});

describe('durable local events', () => {
  it('requires the owning account but permits that account to score offline', async () => {
    await database.metadata.put({ key: 'scoring-account', value: 'organizer' });
    const match = await createMatch(setup(), 'session', database);
    await database.metadata.delete('scoring-account');
    await expect(recordEvent(match.id, 0, 'session', { type: 'TECHNICAL', side: 0 }, crypto.randomUUID(), database)).rejects.toThrow('organizer account');
    await database.metadata.put({ key: 'scoring-account', value: 'someone-else' });
    await expect(recordEvent(match.id, 0, 'session', { type: 'TECHNICAL', side: 0 }, crypto.randomUUID(), database)).rejects.toThrow('organizer account');
    expect(await database.events.count()).toBe(0);
    await database.metadata.put({ key: 'scoring-account', value: 'organizer' });
    await recordEvent(match.id, 0, 'session', { type: 'TECHNICAL', side: 0 }, crypto.randomUUID(), database);
    expect(await database.events.count()).toBe(1);
  });
  it('continues a v2 match without relabelling its events', async () => {
    const match = await createMatch(setup(), 'session', database);
    await database.matches.put({ ...match, rulesetVersion: 'raidzon-v2' });
    const eventId = crypto.randomUUID();
    await recordEvent(match.id, 0, 'session', { type: 'TECHNICAL', side: 0 }, eventId, database);
    expect((await database.events.get(eventId))?.rulesetVersion).toBe('raidzon-v2');
    expect((await database.matches.get(match.id))?.state.scores).toEqual([1, 0]);
  });
  it('preserves earlier ruleset matches and refuses to mix revised rules into their history', async () => {
    const match = await createMatch(setup(), 'session', database);
    expect(match.rulesetVersion).toBe('raidzon-v5');
    await database.matches.put({ ...match, rulesetVersion: 'raidzon-v1' });
    await expect(
      recordEvent(
        match.id,
        0,
        'session',
        { type: 'TECHNICAL', side: 0 },
        crypto.randomUUID(),
        database,
      ),
    ).rejects.toThrow('previous rules');
    expect(await database.events.count()).toBe(0);
    expect((await database.matches.get(match.id))?.state.scores).toEqual([0, 0]);
  });
  it('creates a guest match with seven starters, reuses identities and survives reopen', async () => {
    const owner = await sessionId(database);
    const match = await createMatch(setup(), owner, database);
    const another = await createMatch(setup(), owner, database);
    expect(another.state.teams[0].players[0].id).toBe(match.state.teams[0].players[0].id);
    database.close();
    await database.open();
    expect((await database.matches.get(match.id))?.state.teams[0].players).toHaveLength(7);
    expect(await sessionId(database)).toBe(owner);
  });
  it('rejects duplicate phones and invalid rosters without partial writes', async () => {
    const input = setup();
    input.teams[1].players[0].phone = input.teams[0].players[0].phone;
    await expect(createMatch(input, 'session', database)).rejects.toThrow('unique phone');
    expect(await database.players.count()).toBe(0);
    input.teams[0].players.pop();
    await expect(createMatch(input, 'session', database)).rejects.toThrow('seven starters');
  });
  it('lets a quick match leave phones blank but keeps them required for tournament fixtures', async () => {
    const input = setup();
    input.teams[0].players[0].phone = '';
    input.teams[1].players[0].phone = '';
    const match = await createMatch(input, 'session', database);
    const blanks = match.state.teams.flatMap((team) => team.players).filter((player) => !player.phone);
    expect(blanks).toHaveLength(2);
    expect(new Set(blanks.map((player) => player.id)).size).toBe(2);
    expect(await database.players.count()).toBe(12);
    expect((await recentPlayers(database)).every((player) => player.phone)).toBe(true);
    await expect(
      createMatch({ ...input, fixtureRef: { tournamentId: 't', fixtureId: 'f' } }, 'session', database),
    ).rejects.toThrow('valid phone');
  });
  it('retry of same event is idempotent and different facts with same ID fail', async () => {
    const match = await createMatch(setup(), 'session', database);
    const eventId = crypto.randomUUID();
    await recordEvent(match.id, 0, 'session', { type: 'TECHNICAL', side: 0 }, eventId, database);
    const retry = await recordEvent(
      match.id,
      0,
      'session',
      { type: 'TECHNICAL', side: 0 },
      eventId,
      database,
    );
    expect(retry.state.scores).toEqual([1, 0]);
    expect(await database.events.count()).toBe(1);
    await expect(
      recordEvent(match.id, 0, 'session', { type: 'TECHNICAL', side: 1 }, eventId, database),
    ).rejects.toThrow('reused');
  });
  it('two stale writers cannot overwrite one another and wrong session is rejected', async () => {
    const match = await createMatch(setup(), 'session', database);
    const results = await Promise.allSettled(
      [0, 1].map((side) =>
        recordEvent(
          match.id,
          0,
          'session',
          { type: 'TECHNICAL', side: side as 0 | 1 },
          crypto.randomUUID(),
          database,
        ),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await database.events.count()).toBe(1);
    await expect(
      recordEvent(
        match.id,
        1,
        'other-device',
        { type: 'TECHNICAL', side: 0 },
        crypto.randomUUID(),
        database,
      ),
    ).rejects.toThrow('read-only');
  });
  it('failed evaluation leaves event log and projection unchanged', async () => {
    const match = await createMatch(setup(), 'session', database);
    await expect(
      recordEvent(match.id, 0, 'session', { type: 'SECOND_HALF' }, crypto.randomUUID(), database),
    ).rejects.toThrow();
    expect(await database.events.count()).toBe(0);
    expect((await database.matches.get(match.id))?.version).toBe(0);
  });
  it('Undo is append-only, restores score, and repeated Undo walks backward', async () => {
    let match = await createMatch(setup(), 'session', database);
    match = await recordEvent(
      match.id,
      0,
      'session',
      { type: 'TECHNICAL', side: 0 },
      crypto.randomUUID(),
      database,
    );
    match = await recordEvent(
      match.id,
      1,
      'session',
      { type: 'TECHNICAL', side: 1 },
      crypto.randomUUID(),
      database,
    );
    let history = (await database.events.toArray()).sort((a, b) => a.sequence - b.sequence);
    match = await recordEvent(
      match.id,
      2,
      'session',
      { type: 'UNDO', targetEventId: undoTarget(history)!.id },
      crypto.randomUUID(),
      database,
    );
    expect(match.state.scores).toEqual([1, 0]);
    history = (await database.events.toArray()).sort((a, b) => a.sequence - b.sequence);
    match = await recordEvent(
      match.id,
      3,
      'session',
      { type: 'UNDO', targetEventId: undoTarget(history)!.id },
      crypto.randomUUID(),
      database,
    );
    expect(match.state.scores).toEqual([0, 0]);
    expect(await database.events.count()).toBe(4);
    expect(
      undoTarget((await database.events.toArray()).sort((a, b) => a.sequence - b.sequence)),
    ).toBeUndefined();
  });
  it('All-Out and Undo survive a database restart with all consequences restored', async () => {
    let match = await createMatch(setup(), 'session', database);
    const raiderId = match.state.teams[0].players[0].id;
    const defenderIds = match.state.teams[1].players.map((p) => p.id);
    match = await recordEvent(
      match.id,
      0,
      'session',
      { type: 'START_RAID', raiderId },
      crypto.randomUUID(),
      database,
    );
    const before = structuredClone(match.state);
    const raidId = crypto.randomUUID();
    match = await recordEvent(
      match.id,
      1,
      'session',
      { type: 'RAID', raiderId, outcome: 'TOUCH', defenderIds, bonus: false },
      raidId,
      database,
    );
    expect(match.state.scores).toEqual([9, 0]);
    database.close();
    await database.open();
    match = await recordEvent(
      match.id,
      2,
      'session',
      { type: 'UNDO', targetEventId: raidId },
      crypto.randomUUID(),
      database,
    );
    expect(match.state.teams).toEqual(before.teams);
    expect(match.state.scores).toEqual(before.scores);
    expect(match.state.turn).toEqual(before.turn);
    expect(match.state.raidNumber).toEqual(before.raidNumber);
    expect(match.state.currentRaiderId).toEqual(raiderId);
    expect(await database.events.count()).toBe(3);
  });
  it('a failed projection write rolls back the event insertion', async () => {
    const match = await createMatch(setup(), 'session', database);
    const fail = () => {
      throw new Error('Disk write failed');
    };
    database.matches.hook('updating', fail);
    await expect(
      recordEvent(
        match.id,
        0,
        'session',
        { type: 'TECHNICAL', side: 0 },
        crypto.randomUUID(),
        database,
      ),
    ).rejects.toThrow('Disk write failed');
    database.matches.hook('updating').unsubscribe(fail);
    expect(await database.events.count()).toBe(0);
    expect((await database.matches.get(match.id))?.state.scores).toEqual([0, 0]);
  });
});
