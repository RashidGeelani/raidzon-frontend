import { milestones, type Milestone } from '../scoring/domain/match-summary';
import { winnerSide } from '../scorecard/viewer-state';

/**
 * Organiser poster kit: turns a finished match into the text for a shareable poster. Works from
 * the public match view (/watch) and the scorer's own match state; both have this shape.
 * render-poster.ts draws it.
 */
export interface PosterMatch {
  teams: readonly { name: string; players: readonly { name: string; raidPoints: number; tacklePoints: number }[] }[];
  scores: readonly number[];
  tieScores: readonly number[];
  phase: string;
  /** 0 / 1 / 'DRAW' on the scorer's phone, 'TEAM_A' / 'TEAM_B' / 'DRAW' from the server. */
  winner: unknown;
}
export interface PosterMeta {
  tournamentName?: string | null;
  /** When the match started (ms). */
  date?: number | null;
  venue?: string | null;
}
interface PosterHeader {
  tournament: string | null;
  date: string | null;
  venue: string | null;
}
export interface PosterStar {
  name: string;
  team: string;
  points: number;
}
export interface ResultPoster extends PosterHeader {
  kind: 'result';
  teams: [string, string];
  score: [number, number];
  /** Five-raid tie-break or golden raid score, when the match went to one. */
  tieBreak: [number, number] | null;
  /** "Tigers win" or "Match tied". */
  headline: string;
  winner: 0 | 1 | null;
  topRaider: PosterStar | null;
  topDefender: PosterStar | null;
}
export interface PlayerPoster extends PosterHeader {
  kind: 'player';
  name: string;
  team: string;
  raidPoints: number;
  tacklePoints: number;
  total: number;
  tags: Milestone[];
  /** "Tigers 32 – 28 Lions". */
  scoreLine: string;
}
export type Poster = ResultPoster | PlayerPoster;

export const MAX_TEAM = 22;
export const MAX_PLAYER = 24;
export const MAX_TOURNAMENT = 36;
export const MAX_VENUE = 32;

/** Cuts a long name to max characters with an ellipsis; blank becomes the fallback. */
export function shorten(text: string | null | undefined, max: number, fallback = '') {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return fallback;
  const chars = [...clean];
  return chars.length <= max ? clean : `${chars.slice(0, max - 1).join('').replace(/[\s,.;:–-]+$/u, '')}…`;
}

export const posterDate = (ms: number | null | undefined) =>
  ms ? new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null;

function header(meta: PosterMeta): PosterHeader {
  return {
    tournament: shorten(meta.tournamentName, MAX_TOURNAMENT) || null,
    date: posterDate(meta.date),
    venue: shorten(meta.venue, MAX_VENUE) || null,
  };
}

const teamName = (match: PosterMatch, side: number) => shorten(match.teams[side]?.name, MAX_TEAM, side === 0 ? 'Team A' : 'Team B');

/** Best player by a score, ignoring zeros; ties keep the first found (as the match viewer does). */
function best(match: PosterMatch, score: (p: { raidPoints: number; tacklePoints: number }) => number): PosterStar | null {
  let found: PosterStar | null = null;
  match.teams.forEach((team, side) => team.players.forEach((player) => {
    const points = score(player);
    if (points > 0 && (!found || points > found.points)) found = { name: shorten(player.name, MAX_PLAYER, 'Player'), team: teamName(match, side), points };
  }));
  return found;
}

const side = (match: PosterMatch) => {
  const winner = winnerSide(match.winner);
  return winner === 0 || winner === 1 ? winner : null;
};

export function resultPoster(match: PosterMatch, meta: PosterMeta = {}): ResultPoster {
  const teams: [string, string] = [teamName(match, 0), teamName(match, 1)];
  const winner = side(match);
  return {
    kind: 'result',
    ...header(meta),
    teams,
    score: [match.scores[0] ?? 0, match.scores[1] ?? 0],
    tieBreak: match.phase === 'REGULATION' ? null : [match.tieScores[0] ?? 0, match.tieScores[1] ?? 0],
    headline: winner === null ? 'Match tied' : `${teams[winner]} win`,
    winner,
    topRaider: best(match, (p) => p.raidPoints),
    topDefender: best(match, (p) => p.tacklePoints),
  };
}

/** Player of the match: most raid + tackle points, then most raid points, then the first found. Null when nobody scored. */
export function playerPoster(match: PosterMatch, meta: PosterMeta = {}): PlayerPoster | null {
  const total = (p: { raidPoints: number; tacklePoints: number }) => p.raidPoints + p.tacklePoints;
  const everyone = match.teams.flatMap((team, from) => team.players.map((player) => ({ player, from })));
  const pick = everyone.reduce<(typeof everyone)[number] | null>((top, next) =>
    total(next.player) > 0 && (!top || total(next.player) > total(top.player) || (total(next.player) === total(top.player) && next.player.raidPoints > top.player.raidPoints)) ? next : top, null);
  if (!pick) return null;
  const { player, from } = pick;
  const result = resultPoster(match, meta);
  return {
    kind: 'player',
    ...header(meta),
    name: shorten(player.name, MAX_PLAYER, 'Player'),
    team: teamName(match, from),
    raidPoints: player.raidPoints,
    tacklePoints: player.tacklePoints,
    total: total(player),
    tags: milestones(player),
    scoreLine: `${result.teams[0]} ${result.score[0]} – ${result.score[1]} ${result.teams[1]}`,
  };
}

/**
 * One-line caption sent with the shared image. The link sits inside the text because some apps
 * (WhatsApp among them) drop a separate url when a file is attached; in chats it is tappable.
 */
export function posterCaption(poster: Poster, link: string) {
  let summary: string;
  if (poster.kind === 'player') {
    summary = `${poster.name} (${poster.team}) is Player of the Match with ${poster.total} point${poster.total === 1 ? '' : 's'}`;
  } else if (poster.winner === null) {
    summary = `${poster.teams[0]} and ${poster.teams[1]} drew ${poster.score[0]}-${poster.score[1]}`;
  } else {
    const loser = poster.winner === 0 ? 1 : 0;
    const tieBreak = poster.tieBreak ? ` (tie-break ${poster.tieBreak[poster.winner]}-${poster.tieBreak[loser]})` : '';
    summary = `${poster.teams[poster.winner]} beat ${poster.teams[loser]} ${poster.score[poster.winner]}-${poster.score[loser]}${tieBreak}`;
  }
  return `${poster.tournament ? `${poster.tournament}: ` : ''}${summary} | Full scorecard: ${link}`;
}

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'match';
export const posterFileName = (poster: Poster) =>
  `raidzon-${poster.kind === 'result' ? `${slug(poster.teams[0])}-vs-${slug(poster.teams[1])}` : `${slug(poster.name)}-player-of-the-match`}.png`;
