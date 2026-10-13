// Server-side meta for shared public pages (/watch, /scorecard, /tournaments, /players; see vercel.json rewrites).
// Crawlers and WhatsApp/X previews read the HTML without running the app, so the static index.html
// gets the page's title, description, Open Graph tags, JSON-LD and a short text summary with links.
// Any backend error or slowness falls back to the plain app shell; the app renders the page as usual.
// The JSON-LD shapes mirror src/app/page-meta.ts.
const API = (process.env.VITE_API_BASE_URL || 'https://raidzon-backend.onrender.com').replace(/\/+$/, '');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENDPOINTS = { watch: 'matches', scorecard: 'scorecards', tournaments: 'tournaments', players: 'players' };

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const link = (href, text) => `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`;
const list = (items) => (items.length ? `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>` : '');

function matchPage(url, { teamA, teamB, scoreA, scoreB, status, tournamentId }) {
  const done = status === 'COMPLETED';
  const description = `${teamA} ${scoreA} – ${scoreB} ${teamB}${done ? ' (final)' : ', live'}. Follow this kabaddi match raid by raid on RaidzOn.`;
  return {
    title: `${teamA} vs ${teamB} ${done ? 'result' : 'live score'} · Kabaddi · RaidzOn`,
    description,
    heading: `${teamA} vs ${teamB}`,
    body: tournamentId ? `<p>${link(`/tournaments/${tournamentId}`, 'Tournament fixtures, points table and top players')}</p>` : '',
    jsonLd: {
      '@context': 'https://schema.org', '@type': 'SportsEvent', name: `${teamA} vs ${teamB}`, sport: 'Kabaddi', url,
      eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      competitor: [{ '@type': 'SportsTeam', name: teamA }, { '@type': 'SportsTeam', name: teamB }], description,
    },
  };
}

function tournamentPage(url, { tournament, teams = [], fixtures = [], standings = [] }) {
  const { name, venue, startsOn } = tournament;
  const teamName = (id) => teams.find((team) => team.id === id)?.name ?? 'TBC';
  const leader = standings[0];
  const description = `${name} kabaddi tournament at ${venue} from ${startsOn}: ${teams.length} teams, fixtures, live scores, results and points table${leader ? ` (${leader.teamName} top with ${leader.tablePoints} points)` : ''}.`;
  const table = standings.slice(0, 8).map((row) => `${row.rank}. ${escapeHtml(row.teamName)}: ${row.tablePoints} pts (P${row.played ?? 0} W${row.won ?? 0} L${row.lost ?? 0})`);
  const matches = fixtures.filter((fixture) => fixture.matchId).slice(0, 30).map((fixture) =>
    link(`/watch/${fixture.matchId}`, `${teamName(fixture.teamAId)} ${fixture.scoreA ?? 0} – ${fixture.scoreB ?? 0} ${teamName(fixture.teamBId)}${fixture.status === 'COMPLETED' ? ' (final)' : ''}`));
  return {
    title: `${name} · Kabaddi points table, fixtures & results · RaidzOn`,
    description,
    heading: name,
    body: (table.length ? `<h2>Points table</h2>${list(table)}` : '') + (matches.length ? `<h2>Matches</h2>${list(matches)}` : ''),
    jsonLd: {
      '@context': 'https://schema.org', '@type': 'SportsEvent', name, sport: 'Kabaddi', url, startDate: startsOn,
      eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: { '@type': 'Place', name: venue, address: venue },
      competitor: teams.map((team) => ({ '@type': 'SportsTeam', name: team.name })),
    },
  };
}

function playerPage(url, { name, matches, raidPoints, tacklePoints, tournaments = [] }) {
  const description = `${name}: kabaddi player stats on RaidzOn. ${raidPoints} raid points and ${tacklePoints} tackle points in ${matches} tournament matches.`;
  return {
    title: `${name} · Kabaddi player stats · RaidzOn`,
    description,
    heading: name,
    body: `<h2>Tournaments</h2>${list(tournaments.map((item) =>
      `${link(`/tournaments/${item.tournamentId}`, item.name)}: ${item.matches} matches, ${item.raidPoints} raid, ${item.tacklePoints} tackle points`))}`,
    jsonLd: { '@context': 'https://schema.org', '@type': 'Person', name, url, description, knowsAbout: 'Kabaddi' },
  };
}

/** The page's meta from its public API response. Exported for api/_page.check.mjs. */
export function pageFor(kind, url, data) {
  if (kind === 'tournaments') return tournamentPage(url, data);
  if (kind === 'players') return playerPage(url, data);
  if (kind === 'scorecard') return matchPage(url, data);
  const { teams = [], scores = [], status } = data.state ?? {};
  return matchPage(url, { teamA: teams[0]?.name, teamB: teams[1]?.name, scoreA: scores[0], scoreB: scores[1], status, tournamentId: data.tournamentId });
}

/** index.html with the page meta injected; null page = not public (noindex). Exported for api/_page.check.mjs. */
export function injectPage(html, url, page) {
  if (!page) return html.replace('</head>', '<meta name="robots" content="noindex" />\n  </head>');
  const [t, d, u] = [escapeHtml(page.title), escapeHtml(page.description), escapeHtml(url)];
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*/, `$1${d}`)
    .replace(/(<meta\s+property="og:(?:title|description|url)"\s+content=")[^"]*/g, (_, start) =>
      start + (start.includes('og:title') ? t : start.includes('og:url') ? u : d))
    .replace(/(<meta\s+name="twitter:(?:title|description)"\s+content=")[^"]*/g, (_, start) => start + (start.includes('title') ? t : d))
    .replace(/(<link rel="canonical" href=")[^"]*/, `$1${u}`)
    .replace('</head>', `<script type="application/ld+json">${JSON.stringify(page.jsonLd).replace(/</g, '\\u003c')}</script>\n  </head>`)
    // React replaces #root's children on start; until then non-JS crawlers see the summary.
    .replace('<div id="root"></div>', `<div id="root"><main><h1>${escapeHtml(page.heading)}</h1><p>${d}</p>${page.body}</main></div>`);
}

export async function GET(request) {
  const url = new URL(request.url);
  const kind = ENDPOINTS[url.searchParams.get('kind')] ? url.searchParams.get('kind') : 'watch';
  const id = url.searchParams.get('id') ?? '';
  const shell = await fetch(new URL('/index.html', url));
  let html = await shell.text();
  let status = 200;
  if (UUID.test(id)) {
    try {
      const response = await fetch(`${API}/api/v1/public/${ENDPOINTS[kind]}/${id}`, { signal: AbortSignal.timeout(1500) });
      const pageUrl = `https://raidzon.com/${kind}/${id}`;
      if (response.ok) html = injectPage(html, pageUrl, pageFor(kind, pageUrl, await response.json()));
      else if (response.status === 404) { html = injectPage(html, '', null); status = 404; }
    } catch {
      // Backend asleep or slow: serve the plain shell.
    }
  }
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300' },
  });
}
