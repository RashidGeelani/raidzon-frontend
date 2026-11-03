import { describe, expect, it } from 'vitest';
import { playerPoster, posterCaption, posterFileName, resultPoster, shorten, type PosterMatch } from './poster-model';

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
