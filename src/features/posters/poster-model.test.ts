import { describe, expect, it } from 'vitest';
import { fitRows, fitTables, fixturesPoster, livePoster, playerPoster, posterCaption, posterFileName, printedLink, resultPoster, shortLinkTarget, shorten, tablePoster, type PosterMatch, type PosterTournament } from './poster-model';
import type { FormatFixture, FormatStanding } from '../tournaments/data/format-types';

const p = (name: string, raidPoints: number, tacklePoints: number) => ({ name, raidPoints, tacklePoints });
const match = (over: Partial<PosterMatch> = {}): PosterMatch => ({
  teams: [
    { name: 'Bandipora Bulls', players: [p('Aamir Dar', 9, 1), p('Bilal Shah', 2, 4)] },
    { name: 'Sopore Lions', players: [p('Imran Lone', 6, 0), p('Junaid Mir', 0, 6)] },
  ],
  scores: [32, 28],
  tieScores: [0, 0],
  phase: 'REGULATION',
  winner: 0,
  ...over,
});
const meta = { tournamentName: 'Kashmir Kabaddi Cup 2026', date: new Date(2026, 10, 3, 15).getTime(), venue: 'Sher-i-Kashmir Stadium' };

describe('shorten', () => {
  it('keeps short names and cuts long ones with an ellipsis', () => {
    expect(shorten('Bulls', 10)).toBe('Bulls');
    expect(shorten('Bandipora Bulls Kabaddi Club', 12)).toBe('Bandipora B…');
    expect(shorten('  ', 10, 'Team A')).toBe('Team A');
    expect(shorten(null, 10)).toBe('');
  });
});

describe('resultPoster', () => {
  it('has both teams, the final score, the winner, top raider and defender, and the header', () => {
    expect(resultPoster(match(), meta)).toEqual({
      kind: 'result',
      tournament: 'Kashmir Kabaddi Cup 2026',
      date: '3 Nov 2026',
      venue: 'Sher-i-Kashmir Stadium',
      teams: ['Bandipora Bulls', 'Sopore Lions'],
      score: [32, 28],
      tieBreak: null,
      headline: 'Bandipora Bulls win',
      winner: 0,
      topRaider: { name: 'Aamir Dar', team: 'Bandipora Bulls', points: 9 },
      topDefender: { name: 'Junaid Mir', team: 'Sopore Lions', points: 6 },
    });
  });
  it('reads the server winner and shows the tie-break score', () => {
    const poster = resultPoster(match({ scores: [30, 30], tieScores: [4, 5], phase: 'TIE_BREAK', winner: 'TEAM_B' }));
    expect(poster.headline).toBe('Sopore Lions win');
    expect(poster.tieBreak).toEqual([4, 5]);
  });
  it('says "Match tied" for a draw', () => {
    expect(resultPoster(match({ scores: [30, 30], winner: 'DRAW' })).headline).toBe('Match tied');
    expect(resultPoster(match({ winner: null })).winner).toBeNull();
  });
  it('leaves out the tournament, venue and date when there are none', () => {
    const poster = resultPoster(match(), { tournamentName: '', venue: null });
    expect([poster.tournament, poster.venue, poster.date]).toEqual([null, null, null]);
  });
  it('handles 0-0 with nobody scoring', () => {
    const zero = match({ teams: [{ name: 'A', players: [p('X', 0, 0)] }, { name: 'B', players: [] }], scores: [0, 0], winner: 'DRAW' });
    expect(resultPoster(zero)).toMatchObject({ score: [0, 0], headline: 'Match tied', topRaider: null, topDefender: null });
  });
  it('shortens long team names', () => {
    const poster = resultPoster(match({ teams: [{ name: 'Royal Challengers of North Kashmir Kabaddi', players: [] }, { name: '', players: [] }] }));
    expect(poster.teams[0]).toBe('Royal Challengers of…');
    expect([...poster.teams[0]].length).toBeLessThanOrEqual(22);
    expect(poster.teams[1]).toBe('Team B');
    expect(poster.headline).toBe('Royal Challengers of… win');
  });
  it('keeps the first player found when top raiders tie', () => {
    const tied = match({ teams: [{ name: 'A', players: [p('First', 5, 0)] }, { name: 'B', players: [p('Second', 5, 0)] }] });
    expect(resultPoster(tied).topRaider?.name).toBe('First');
  });
});

describe('playerPoster', () => {
  it('picks the most total points, with the team, points and milestone tags', () => {
    const star = match({ teams: [{ name: 'A', players: [p('Aamir', 11, 1)] }, { name: 'B', players: [p('Junaid', 2, 5)] }] });
    expect(playerPoster(star, meta)).toEqual({
      kind: 'player',
      tournament: 'Kashmir Kabaddi Cup 2026',
      date: '3 Nov 2026',
      venue: 'Sher-i-Kashmir Stadium',
      name: 'Aamir',
      team: 'A',
      raidPoints: 11,
      tacklePoints: 1,
      total: 12,
      tags: ['Super 10'],
      scoreLine: 'A 32 – 28 B',
    });
  });
  it('tags a High 5 and both together', () => {
    expect(playerPoster(match({ teams: [{ name: 'A', players: [p('D', 1, 5)] }, { name: 'B', players: [] }] }))?.tags).toEqual(['High 5']);
    expect(playerPoster(match({ teams: [{ name: 'A', players: [p('D', 10, 5)] }, { name: 'B', players: [] }] }))?.tags).toEqual(['Super 10', 'High 5']);
  });
  it('breaks a tie on total by raid points, then keeps the first found', () => {
    const byRaid = match({ teams: [{ name: 'A', players: [p('Defender', 2, 6)] }, { name: 'B', players: [p('Raider', 7, 1)] }] });
    expect(playerPoster(byRaid)?.name).toBe('Raider');
    const level = match({ teams: [{ name: 'A', players: [p('First', 4, 4)] }, { name: 'B', players: [p('Second', 4, 4)] }] });
    expect(playerPoster(level)?.name).toBe('First');
  });
  it('has no player of the match when nobody scored', () => {
    expect(playerPoster(match({ teams: [{ name: 'A', players: [p('X', 0, 0)] }, { name: 'B', players: [] }], scores: [0, 0] }))).toBeNull();
  });
  it('shortens a long player name', () => {
    const long = match({ teams: [{ name: 'A', players: [p('Mohammad Aamir Hussain Dar Bhat', 3, 0)] }, { name: 'B', players: [] }] });
    expect(playerPoster(long)?.name).toBe('Mohammad Aamir Hussain…');
  });
});

describe('posterFileName', () => {
  it('names the file after the teams or the player', () => {
    expect(posterFileName(resultPoster(match()))).toBe('raidzon-bandipora-bulls-vs-sopore-lions.png');
    expect(posterFileName(playerPoster(match())!)).toBe('raidzon-aamir-dar-player-of-the-match.png');
  });
});

describe('posterCaption', () => {
  const link = 'https://raidzon.com/watch/abc';
  it('puts a one-line result and the link in the caption', () => {
    expect(posterCaption(resultPoster(match(), meta), link)).toBe('Kashmir Kabaddi Cup 2026: Bandipora Bulls beat Sopore Lions 32-28 | Full scorecard: https://raidzon.com/watch/abc');
    expect(posterCaption(resultPoster(match({ scores: [26, 31], winner: 'TEAM_B' })), link)).toBe('Sopore Lions beat Bandipora Bulls 31-26 | Full scorecard: https://raidzon.com/watch/abc');
  });
  it('says drew for a tie and adds the tie-break score', () => {
    expect(posterCaption(resultPoster(match({ scores: [30, 30], winner: 'DRAW' })), link)).toBe('Bandipora Bulls and Sopore Lions drew 30-30 | Full scorecard: https://raidzon.com/watch/abc');
    expect(posterCaption(resultPoster(match({ scores: [30, 30], tieScores: [4, 5], phase: 'TIE_BREAK', winner: 1 })), link)).toBe('Sopore Lions beat Bandipora Bulls 30-30 (tie-break 5-4) | Full scorecard: https://raidzon.com/watch/abc');
  });
  it('names the player of the match with their points', () => {
    expect(posterCaption(playerPoster(match())!, link)).toBe('Aamir Dar (Bandipora Bulls) is Player of the Match with 10 points | Full scorecard: https://raidzon.com/watch/abc');
    const one = match({ teams: [{ name: 'A', players: [p('Solo', 1, 0)] }, { name: 'B', players: [] }] });
    expect(posterCaption(playerPoster(one)!, link)).toBe('Solo (A) is Player of the Match with 1 point | Full scorecard: https://raidzon.com/watch/abc');
  });
});

describe('livePoster', () => {
  it('has both teams and the header, shortening long names', () => {
    expect(livePoster(['Bandipora Bulls', 'Royal Challengers of North Kashmir'], meta)).toEqual({
      kind: 'live', tournament: 'Kashmir Kabaddi Cup 2026', date: '3 Nov 2026', venue: 'Sher-i-Kashmir Stadium', teams: ['Bandipora Bulls', 'Royal Challengers of…'],
    });
    expect(livePoster([], {}).teams).toEqual(['Team A', 'Team B']);
  });
  it('captions the match link', () => {
    expect(posterCaption(livePoster(['A', 'B'], meta), 'https://raidzon.com/watch/x')).toBe('LIVE now: A vs B (Kashmir Kabaddi Cup 2026) | Watch raid by raid: https://raidzon.com/watch/x');
    expect(posterCaption(livePoster(['A', 'B']), 'L')).toBe('LIVE now: A vs B | Watch raid by raid: L');
  });
});

const fx = (id: string, teamAId: string | null, teamBId: string | null, scheduledAt: string | null, extra: Partial<FormatFixture> = {}): FormatFixture => ({
  id, teamAId, teamBId, scheduledAt, matchId: null, status: null, scoreA: null, scoreB: null, phase: null, tieScoreA: null, tieScoreB: null, winner: null, ...extra,
});
const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).toISOString();
const tournament = (over: Partial<PosterTournament> = {}): PosterTournament => ({
  tournament: { name: 'Kashmir Kabaddi Cup 2026', venue: 'Sopore Stadium' },
  teams: [{ id: 'a', name: 'Bandipora Bulls' }, { id: 'b', name: 'Sopore Lions' }, { id: 'c', name: 'Baramulla Tigers' }, { id: 'd', name: 'Kupwara Kings' }],
  fixtures: [],
  standings: [],
  ...over,
});

describe('fixturesPoster', () => {
  it('lists the unfinished matches on the day of the next scheduled one, earliest first', () => {
    const poster = fixturesPoster(tournament({ fixtures: [
      fx('1', 'a', 'b', at(3, 16), { status: 'COMPLETED' }),
      fx('2', 'c', 'd', at(4, 17, 30)),
      fx('3', 'a', 'c', at(4, 16)),
      fx('4', 'b', 'd', at(5, 16)),
      fx('5', 'a', 'd', null),
    ] }))!;
    expect(poster.label).toBe('Wed, 4 Nov');
    expect(poster.rows).toEqual([
      { teamA: 'Bandipora Bulls', teamB: 'Baramulla Tigers', time: '4:00 pm', stage: null },
      { teamA: 'Baramulla Tigers', teamB: 'Kupwara Kings', time: '5:30 pm', stage: null },
    ]);
    expect(poster.venue).toBe('Sopore Stadium');
  });
  it('shows a match under way as LIVE', () => {
    expect(fixturesPoster(tournament({ fixtures: [fx('1', 'a', 'b', at(4, 16), { status: 'LIVE' })] }))!.rows[0].time).toBe('LIVE');
  });
  it('falls back to the first round still to play when nothing has a time', () => {
    const poster = fixturesPoster(tournament({ fixtures: [fx('1', 'a', 'b', null, { stage: 'LEAGUE', round: 2 }), fx('2', 'c', 'd', null, { stage: 'LEAGUE', round: 2 }), fx('3', 'a', 'c', null, { stage: 'LEAGUE', round: 3 })] }))!;
    expect(poster.label).toBe('Round 2');
    expect(poster.rows.map((row) => row.time)).toEqual(['Time TBC', 'Time TBC']);
  });
  it('takes the whole next round across groups when nothing has a time', () => {
    const poster = fixturesPoster(tournament({
      groups: [{ id: 'g1', name: 'A', teamIds: ['a', 'b'] }, { id: 'g2', name: 'B', teamIds: ['c', 'd'] }],
      fixtures: [fx('1', 'a', 'b', null, { stage: 'GROUP', groupId: 'g1', round: 2 }), fx('2', 'c', 'd', null, { stage: 'GROUP', groupId: 'g2', round: 2 }), fx('3', 'a', 'c', null, { stage: 'GROUP', groupId: 'g1', round: 3 })],
    }))!;
    expect(poster.label).toBe('Round 2');
    expect(poster.rows.map((row) => row.stage)).toEqual(['Group A', 'Group B']);
  });
  it('leaves out a stage that repeats the heading', () => {
    const poster = fixturesPoster(tournament({ fixtures: [fx('1', null, null, null, { stage: 'KNOCKOUT', round: 1, roundName: 'Final', labelA: 'Winner SF1', labelB: 'Winner SF2' })] }))!;
    expect([poster.label, poster.rows[0].stage]).toEqual(['Final', null]);
  });
  it('names groups and knockout places still to be decided', () => {
    const poster = fixturesPoster(tournament({
      groups: [{ id: 'g1', name: 'A', teamIds: ['a', 'b'] }],
      fixtures: [fx('1', 'a', 'b', at(4, 16), { stage: 'GROUP', groupId: 'g1' }), fx('2', null, null, at(4, 18), { stage: 'KNOCKOUT', labelA: 'Winner Group A', labelB: 'Winner Group B', roundName: 'Final' })],
    }))!;
    expect(poster.rows).toEqual([
      { teamA: 'Bandipora Bulls', teamB: 'Sopore Lions', time: '4:00 pm', stage: 'Group A' },
      { teamA: 'Winner Group A', teamB: 'Winner Group B', time: '6:00 pm', stage: 'Final' },
    ]);
  });
  it('is null when every fixture is played, or there are none', () => {
    expect(fixturesPoster(tournament({ fixtures: [fx('1', 'a', 'b', at(3, 16), { status: 'COMPLETED' })] }))).toBeNull();
    expect(fixturesPoster(tournament())).toBeNull();
  });
  it('captions the first three matches and how many more', () => {
    const many = tournament({ fixtures: [1, 2, 3, 4, 5].map((n) => fx(String(n), 'a', 'b', at(4, 10 + n))) });
    expect(posterCaption(fixturesPoster(many)!, 'L')).toBe('Kashmir Kabaddi Cup 2026: next matches, Wed, 4 Nov: Bandipora Bulls vs Sopore Lions (11:00 am), Bandipora Bulls vs Sopore Lions (12:00 pm), Bandipora Bulls vs Sopore Lions (1:00 pm) and 2 more | Fixtures and live scores: L');
  });
});

describe('fitRows', () => {
  it('keeps every row that fits, otherwise leaves the last line for "+N more"', () => {
    expect(fitRows([1, 2, 3], 3)).toEqual({ shown: [1, 2, 3], more: 0 });
    expect(fitRows([1, 2, 3, 4, 5], 3)).toEqual({ shown: [1, 2], more: 3 });
  });
});

const st = (teamId: string, teamName: string, rank: number, tablePoints: number, extra: Partial<FormatStanding> = {}): FormatStanding => ({
  teamId, teamName, rank, tablePoints, played: 3, won: tablePoints / 3, drawn: 0, lost: 3 - tablePoints / 3, scoreDifference: 0, ...extra,
});

describe('tablePoster', () => {
  it('makes one league table with progress', () => {
    const poster = tablePoster(tournament({
      standings: [st('a', 'Bandipora Bulls', 1, 9), st('b', 'Sopore Lions', 2, 6, { drawn: 1, won: 2, lost: 0 })],
      fixtures: [fx('1', 'a', 'b', null, { status: 'COMPLETED' }), fx('2', 'a', 'b', null)],
    }))!;
    expect(poster.progress).toBe('1 of 2 matches played');
    expect(poster.tables).toEqual([{ title: '', note: null, hidden: 0, rows: [
      { rank: 1, team: 'Bandipora Bulls', played: 3, won: 3, drawn: 0, lost: 0, points: 9, qualifies: false },
      { rank: 2, team: 'Sopore Lions', played: 3, won: 2, drawn: 1, lost: 0, points: 6, qualifies: false },
    ] }]);
    expect(posterCaption(poster, 'L')).toBe('Kashmir Kabaddi Cup 2026: points table, Bandipora Bulls top with 9 pts | Full table: L');
  });
  it('makes one table per group with who goes through', () => {
    const poster = tablePoster(tournament({
      format: { type: 'GROUPS_KNOCKOUT', groupCount: 2, advancePerGroup: 1, thirdPlace: false, locked: true, generated: true },
      groups: [{ id: 'g1', name: 'A', teamIds: ['a', 'b'] }, { id: 'g2', name: 'B', teamIds: ['c', 'd'] }],
      standings: [st('a', 'Bandipora Bulls', 1, 3, { groupId: 'g1', qualifies: true }), st('b', 'Sopore Lions', 2, 0, { groupId: 'g1' }), st('c', 'Baramulla Tigers', 1, 3, { groupId: 'g2', qualifies: true }), st('d', 'Kupwara Kings', 2, 0, { groupId: 'g2' })],
    }))!;
    expect(poster.tables.map((table) => [table.title, table.note, table.rows.map((row) => [row.team, row.qualifies])])).toEqual([
      ['Group A', 'Top 1 go through', [['Bandipora Bulls', true], ['Sopore Lions', false]]],
      ['Group B', 'Top 1 go through', [['Baramulla Tigers', true], ['Kupwara Kings', false]]],
    ]);
    expect(posterCaption(poster, 'L')).toBe('Kashmir Kabaddi Cup 2026: points table, Group A Bandipora Bulls top with 3 pts, Group B Baramulla Tigers top with 3 pts | Full table: L');
  });
  it('is null for a knockout or before teams are added', () => {
    expect(tablePoster(tournament({ format: { type: 'KNOCKOUT', groupCount: 0, advancePerGroup: 0, thirdPlace: false, locked: true, generated: true }, standings: [st('a', 'A', 1, 0)] }))).toBeNull();
    expect(tablePoster(tournament())).toBeNull();
  });
  it('shortens long team names', () => {
    expect(tablePoster(tournament({ standings: [st('a', 'Royal Challengers of North Kashmir', 1, 0)] }))!.tables[0].rows[0].team).toBe('Royal Challengers of…');
  });
});

describe('fitTables', () => {
  const table = (title: string, count: number) => ({ title, note: null, hidden: 0, rows: Array.from({ length: count }, (_, i) => ({ rank: i + 1, team: `T${i + 1}`, played: 0, won: 0, drawn: 0, lost: 0, points: 0, qualifies: false })) });
  it('keeps every row when they fit', () => {
    expect(fitTables([table('A', 4), table('B', 4)], 8).map((t) => [t.rows.length, t.hidden])).toEqual([[4, 0], [4, 0]]);
  });
  it('cuts a long league table to the top teams', () => {
    const [cut] = fitTables([table('League', 16)], 8);
    expect([cut.rows.length, cut.hidden, cut.rows[0].team]).toEqual([7, 9, 'T1']);
  });
  it('gives each group an equal share, at least two lines', () => {
    expect(fitTables([table('A', 5), table('B', 5), table('C', 5), table('D', 5)], 8).map((t) => [t.rows.length, t.hidden])).toEqual([[1, 4], [1, 4], [1, 4], [1, 4]]);
  });
});

describe('posterFileName for tournament posters', () => {
  it('names the file after the tournament', () => {
    expect(posterFileName(tablePoster(tournament({ standings: [st('a', 'A', 1, 0)] }))!)).toBe('raidzon-kashmir-kabaddi-cup-2026-points-table.png');
    expect(posterFileName(livePoster(['A Team', 'B Team']))).toBe('raidzon-a-team-vs-b-team-live.png');
  });
});

describe('sponsors on posters', () => {
  const sponsors = [
    { name: 'Valley Sports', level: 'PARTNER' as const, logoUrl: '/p1' },
    { name: 'ABC Motors', level: 'TITLE' as const, logoUrl: '/t' },
    { name: 'Sopore Sweets', level: 'PARTNER' as const, logoUrl: '/p2' },
  ];
  it('puts the Title sponsor first and says "presented by" it', () => {
    const poster = resultPoster(match(), { ...meta, sponsors });
    expect(poster.presentedBy).toBe('ABC Motors');
    expect(poster.sponsors?.map((s) => s.name)).toEqual(['ABC Motors', 'Valley Sports', 'Sopore Sweets']);
  });
  it('has no presented-by line without a Title sponsor, and no row without sponsors', () => {
    expect(resultPoster(match(), { sponsors: [sponsors[0]] }).presentedBy).toBeUndefined();
    expect(resultPoster(match(), meta).sponsors).toBeUndefined();
  });
  it('shows at most four logos', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ name: `S${i}`, level: 'PARTNER' as const, logoUrl: `/${i}` }));
    expect(livePoster(['A', 'B'], { sponsors: many }).sponsors).toHaveLength(4);
  });
  it('carries tournament sponsors onto tournament posters', () => {
    expect(tablePoster(tournament({ standings: [st('a', 'A', 1, 0)], sponsors }))!.presentedBy).toBe('ABC Motors');
  });
});

describe('short links', () => {
  it('prints only short links, without the protocol', () => {
    expect(printedLink('https://raidzon.com/m/AB2CD')).toBe('raidzon.com/m/AB2CD');
    expect(printedLink('https://www.raidzon.com/m/AB2CD')).toBe('raidzon.com/m/AB2CD');
    expect(printedLink('https://raidzon.com/watch/6f1c2a9e-3b7d-4c55-9a10-2e8f4d7b1c3a')).toBeNull();
  });
  it('finds the match or tournament a link points at', () => {
    expect(shortLinkTarget('https://raidzon.com/watch/6f1c2a9e-3b7d-4c55-9a10-2e8f4d7b1c3a')).toEqual({ type: 'MATCH', id: '6f1c2a9e-3b7d-4c55-9a10-2e8f4d7b1c3a' });
    expect(shortLinkTarget('https://raidzon.com/tournaments/b1d2c3e4-0000-4000-8000-000000000001')).toEqual({ type: 'TOURNAMENT', id: 'b1d2c3e4-0000-4000-8000-000000000001' });
    expect(shortLinkTarget('https://raidzon.com/m/AB2CD')).toBeNull();
  });
  it('captions with the short link when there is one', () => {
    expect(posterCaption(livePoster(['A', 'B']), 'https://raidzon.com/m/AB2CD')).toBe('LIVE now: A vs B | Watch raid by raid: https://raidzon.com/m/AB2CD');
  });
});
