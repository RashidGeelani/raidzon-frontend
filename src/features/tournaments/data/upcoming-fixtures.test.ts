import { describe, expect, it } from 'vitest';
import type { LocalMatch } from '../../scoring/domain/match-types';
import { collectUpcomingFixtures, type TournamentFixtureDetail } from './upcoming-fixtures';

describe('upcoming tournament fixtures', () => {
  const detail: TournamentFixtureDetail = {
    tournament: { id: 'cup', name: 'District Cup', venue: 'Main court', startsOn: '2026-10-10', halfMinutes: 20, raidSeconds: 30 },
    teams: [
      { id: 'a', name: 'Raiders', roster: [{ name: 'A One', phone: '+919111111111' }] },
      { id: 'b', name: 'Defenders', roster: [{ name: 'B One', phone: '+919222222222' }] },
    ],
    fixtures: [
      { id: 'later', teamAId: 'a', teamBId: 'b', scheduledAt: '2026-10-12T12:00:00Z', matchId: null },
      { id: 'earlier', teamAId: 'a', teamBId: 'b', scheduledAt: '2026-10-11T12:00:00Z', matchId: null },
      { id: 'linked', teamAId: 'a', teamBId: 'b', scheduledAt: null, matchId: 'match-1' },
    ],
  };

  it('orders unstarted fixtures and carries the saved roster into preparation', () => {
    const fixtures = collectUpcomingFixtures([detail], []);
    expect(fixtures.map((fixture) => fixture.id)).toEqual(['earlier', 'later']);
    expect(fixtures[0].prepared).toMatchObject({
      tournamentId: 'cup', fixtureId: 'earlier', halfMinutes: 20, raidSeconds: 30,
      rosterA: [{ name: 'A One', phone: '+919111111111' }],
    });
  });

  it('does not offer a fixture already prepared on this device', () => {
    const local = [{ fixtureRef: { fixtureId: 'earlier' } }] as LocalMatch[];
    expect(collectUpcomingFixtures([detail], local).map((fixture) => fixture.id)).toEqual(['later']);
  });
});
