import { milestones, type Milestone } from '../scoring/domain/match-summary';
import { winnerSide } from '../scorecard/viewer-state';
import { fixtureSections, sideName, type FormatFixture, type FormatStanding, type TournamentFormat, type TournamentGroup } from '../tournaments/data/format-types';

/**
 * Organiser poster kit: turns match and tournament data into the text for a shareable poster.
 * Match posters work from the public match view (/watch) and the scorer's own match state; both
 * have this shape. Tournament posters work from the public tournament view and the organiser's
 * dashboard. render-poster.ts draws them.
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
export interface FixtureRow {
  teamA: string;
  teamB: string;
  /** "4:30 pm", "LIVE" or "Time TBC". */
  time: string;
  /** "Group A", "Semi-final"… when the tournament has stages. */
  stage: string | null;
}
export interface FixturesPoster extends PosterHeader {
  kind: 'fixtures';
  /** "Tue, 4 Nov" or the round ("Round 2") when the matches have no time yet. */
  label: string;
  rows: FixtureRow[];
}
export interface TableRow {
  rank: number;
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
  qualifies: boolean;
}
export interface PosterTable {
  /** Group name; empty for a single league table. */
  title: string;
  /** "Top 2 go through" for group tables. */
  note: string | null;
  rows: TableRow[];
  /** Rows left out to fit the poster. */
  hidden: number;
}
export interface TablePoster extends PosterHeader {
  kind: 'table';
  /** "12 of 20 matches played". */
  progress: string;
  tables: PosterTable[];
}
export interface LivePoster extends PosterHeader {
  kind: 'live';
  teams: [string, string];
}
export type Poster = ResultPoster | PlayerPoster | FixturesPoster | TablePoster | LivePoster;

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

/** A match that is starting or under way: teams and where to watch. */
export function livePoster(teams: readonly string[], meta: PosterMeta = {}): LivePoster {
  return { kind: 'live', ...header(meta), teams: [shorten(teams[0], MAX_TEAM, 'Team A'), shorten(teams[1], MAX_TEAM, 'Team B')] };
}

/** What both tournament views (public page, organiser dashboard) have; only the fields posters need. */
export interface PosterTournament {
  tournament: { name: string; venue: string };
  teams: readonly { id: string; name: string }[];
  fixtures: readonly FormatFixture[];
  standings: readonly FormatStanding[];
  format?: TournamentFormat | null;
  groups?: readonly TournamentGroup[];
}

const tournamentHeader = (detail: PosterTournament) => header({ tournamentName: detail.tournament.name, venue: detail.tournament.venue });
const dayKey = (ms: number) => new Date(ms).toDateString();
/** "4:30 pm". */
export const posterTime = (ms: number) =>
  new Date(ms).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).replace(/\s*([ap])\.?\s*m\.?/i, ' $1m').toLowerCase();

/**
 * Next matches: every unfinished fixture on the day of the earliest scheduled one. When nothing has
 * a time yet, the first round still to play (across all groups), or the first knockout round.
 * Null when no fixtures are left.
 */
export function fixturesPoster(detail: PosterTournament): FixturesPoster | null {
  const teamName = (id: string) => detail.teams.find((team) => team.id === id)?.name ?? 'Team';
  const pending = detail.fixtures.filter((fixture) => fixture.status !== 'COMPLETED');
  if (!pending.length) return null;
  const timed = pending.filter((fixture) => fixture.scheduledAt).sort((a, b) => Date.parse(a.scheduledAt!) - Date.parse(b.scheduledAt!));
  let label: string;
  let picked: FormatFixture[];
  if (timed.length) {
    const first = Date.parse(timed[0].scheduledAt!);
    picked = timed.filter((fixture) => dayKey(Date.parse(fixture.scheduledAt!)) === dayKey(first));
    label = new Date(first).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  } else {
    const section = fixtureSections([...pending], [...(detail.groups ?? [])])[0];
    const first = section.fixtures[0];
    if (first.stage === 'GROUP' && first.round) {
      picked = pending.filter((fixture) => fixture.stage === 'GROUP' && fixture.round === first.round);
      label = `Round ${first.round}`;
    } else {
      picked = section.fixtures;
      label = section.title;
    }
  }
  const groupName = (id?: string | null) => detail.groups?.find((group) => group.id === id)?.name;
  return {
    kind: 'fixtures',
    ...tournamentHeader(detail),
    label,
    rows: picked.map((fixture) => ({
      teamA: shorten(sideName(fixture, 'A', teamName), MAX_TEAM),
      teamB: shorten(sideName(fixture, 'B', teamName), MAX_TEAM),
      time: fixture.status ? 'LIVE' : fixture.scheduledAt ? posterTime(Date.parse(fixture.scheduledAt)) : 'Time TBC',
      stage: (fixture.stage === 'GROUP' && groupName(fixture.groupId) ? `Group ${groupName(fixture.groupId)}` : fixture.roundName ?? null) === label ? null
        : fixture.stage === 'GROUP' && groupName(fixture.groupId) ? `Group ${groupName(fixture.groupId)}` : fixture.roundName ?? null,
    })),
  };
}

/** The first rows that fit in max lines, the last line becoming "+N more" when some are left out. */
export function fitRows<T>(rows: readonly T[], max: number) {
  return rows.length <= max ? { shown: [...rows], more: 0 } : { shown: rows.slice(0, max - 1), more: rows.length - max + 1 };
}

/** League table, or one table per group. Null when there is no table (knockout, or no teams yet). */
export function tablePoster(detail: PosterTournament): TablePoster | null {
  if (detail.format?.type === 'KNOCKOUT' || !detail.standings.length) return null;
  const row = (standing: FormatStanding): TableRow => ({
    rank: standing.rank,
    team: shorten(standing.teamName, MAX_TEAM, 'Team'),
    played: standing.played ?? 0,
    won: standing.won ?? 0,
    drawn: standing.drawn ?? 0,
    lost: standing.lost ?? 0,
    points: standing.tablePoints,
    qualifies: !!standing.qualifies,
  });
  const groups = detail.format?.type === 'GROUPS_KNOCKOUT' ? detail.groups ?? [] : [];
  const tables: PosterTable[] = groups.length
    ? groups.map((group) => ({ title: `Group ${group.name}`, note: `Top ${detail.format!.advancePerGroup} go through`, rows: detail.standings.filter((s) => s.groupId === group.id).map(row), hidden: 0 }))
    : [{ title: '', note: null, rows: detail.standings.map(row), hidden: 0 }];
  const played = detail.fixtures.filter((fixture) => fixture.status === 'COMPLETED').length;
  return { kind: 'table', ...tournamentHeader(detail), progress: `${played} of ${detail.fixtures.length} matches played`, tables };
}

/**
 * Cuts the tables to a row budget for one poster size: every row when they fit, otherwise an equal
 * share per table (at least 2 lines each), the top of each table first.
 */
export function fitTables(tables: readonly PosterTable[], budget: number): PosterTable[] {
  const total = tables.reduce((sum, table) => sum + table.rows.length, 0);
  if (total <= budget) return tables.map((table) => ({ ...table, hidden: 0 }));
  const share = Math.max(2, Math.floor(budget / tables.length));
  return tables.map((table) => {
    const { shown, more } = fitRows(table.rows, share);
    return { ...table, rows: shown, hidden: more };
  });
}

/**
 * One-line caption sent with the shared image. The link sits inside the text because some apps
 * (WhatsApp among them) drop a separate url when a file is attached; in chats it is tappable.
 */
export function posterCaption(poster: Poster, link: string) {
  const tournament = poster.tournament ? `${poster.tournament}: ` : '';
  if (poster.kind === 'live') return `LIVE now: ${poster.teams[0]} vs ${poster.teams[1]}${poster.tournament ? ` (${poster.tournament})` : ''} | Watch raid by raid: ${link}`;
  if (poster.kind === 'fixtures') {
    const list = poster.rows.slice(0, 3).map((row) => `${row.teamA} vs ${row.teamB}${row.time === 'Time TBC' ? '' : ` (${row.time})`}`).join(', ');
    const more = poster.rows.length > 3 ? ` and ${poster.rows.length - 3} more` : '';
    return `${tournament}next matches, ${poster.label}: ${list}${more} | Fixtures and live scores: ${link}`;
  }
  if (poster.kind === 'table') {
    const leaders = poster.tables.filter((table) => table.rows.length)
      .map((table) => `${poster.tables.length > 1 ? `${table.title} ` : ''}${table.rows[0].team} top with ${table.rows[0].points} pt${table.rows[0].points === 1 ? '' : 's'}`).join(', ');
    return `${tournament}points table, ${leaders} | Full table: ${link}`;
  }
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
  return `${tournament}${summary} | Full scorecard: ${link}`;
}

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'match';
export function posterFileName(poster: Poster) {
  const name = poster.kind === 'result' ? `${slug(poster.teams[0])}-vs-${slug(poster.teams[1])}`
    : poster.kind === 'live' ? `${slug(poster.teams[0])}-vs-${slug(poster.teams[1])}-live`
      : poster.kind === 'player' ? `${slug(poster.name)}-player-of-the-match`
        : `${slug(poster.tournament ?? 'tournament')}-${poster.kind === 'fixtures' ? 'fixtures' : 'points-table'}`;
  return `raidzon-${name}.png`;
}
