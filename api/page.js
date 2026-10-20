// Server-side meta for public pages (/watch, /scorecard, /tournaments, /players, /help, /privacy; see vercel.json rewrites).
// Crawlers and WhatsApp/X previews read the HTML without running the app, so the static index.html
// gets the page's title, description, Open Graph tags, JSON-LD and a short text summary with links.
// Any backend error or slowness falls back to the plain app shell; the app renders the page as usual.
// The JSON-LD shapes mirror src/app/page-meta.ts.
const API = (process.env.VITE_API_BASE_URL || 'https://raidzon-backend.onrender.com').replace(/\/+$/, '');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENDPOINTS = { watch: 'matches', scorecard: 'scorecards', tournaments: 'tournaments', players: 'players' };
export const MIN_RAIDS = 15;

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const link = (href, text) => `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`;
const list = (items) => (items.length ? `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>` : '');

/** Plain-text copy of the Help FAQ in src/features/legal/InfoPages.tsx; api/_page.check.mjs fails if the questions drift. */
export const FAQ = [
  ['Do I need an account to score?', 'No. Anyone can score a match on their phone without signing in, even with no internet. Sign in with your phone number when you want to share the match live, keep stats on your player profile, or run a tournament.'],
  ['What happens if the internet drops during a match?', 'Keep scoring. Every raid is saved on your phone first and uploads automatically when you reconnect. The badge above the scoreboard shows whether watchers are seeing the latest score.'],
  ['How do people watch the match live?', 'When you start a match while signed in, you get a live link to copy or share on WhatsApp. Anyone with the link sees the score raid by raid. You can find it again with "Share live link" on the scoring screen.'],
  ['When does the match clock start?', 'Each half’s clock starts with that half’s first raid. The raid timer turns red with a beep in the last 10 seconds of a raid.'],
  ['How do I undo a mistake?', 'Tap "Undo last event" below the raid panel. It reverses the latest event and restores the score, players and revival queue.'],
  ['How do the on-court tabs work?', 'The slim tabs at the screen edges show each team’s players on court (green dot) and the revival queue in the order players return. Tap a tab to open or close it.'],
  ['How do I run a tournament?', 'Open Tournaments → My tournaments and tap Host your own tournament. Add teams, schedule fixtures, then score each fixture. Standings update automatically.'],
  ['How does a team join someone else’s tournament?', 'Open the tournament from Explore and use "Play in this tournament" to send a request with your saved squad. The organizer approves or rejects it, and you get a notification either way.'],
  ['Why does my name look different in some matches?', 'The name you set on your profile replaces the name a team typed for you in every match linked to your verified number. You can change your profile name once every 30 days.'],
];
const STATIC_PAGES = {
  help: {
    title: 'Help & FAQ · RaidzOn kabaddi scoring app',
    description: 'How to score kabaddi matches, share live scores and run tournaments with RaidzOn. Answers to common questions and how to contact support.',
    heading: 'How can we help?',
    body: `<h2>Frequently asked questions</h2>${FAQ.map(([q, a]) => `<h3>${escapeHtml(q)}</h3><p>${escapeHtml(a)}</p>`).join('')}<p>${link('mailto:support@raidzon.com', 'support@raidzon.com')}</p>`,
    jsonLd: {
      '@context': 'https://schema.org', '@type': 'FAQPage', url: 'https://raidzon.com/help',
      mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    },
  },
  privacy: {
    title: 'Privacy policy · RaidzOn',
    description: 'What data RaidzOn collects to score kabaddi matches, run tournaments and keep player stats, and how it is used.',
    heading: 'Your data, plainly explained',
    body: '<p>RaidzOn collects only what it needs to score matches, run tournaments and keep player statistics: your phone number to sign in, the names and match data that scorers enter, and basic technical logs. Phone numbers are never shown on public scorecards or live links. We do not sell your information and we do not show ads. Email support@raidzon.com to access, correct or delete your information.</p>',
    jsonLd: { '@context': 'https://schema.org', '@type': 'WebPage', name: 'Privacy policy · RaidzOn', url: 'https://raidzon.com/privacy' },
  },
};

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
  // A scorecard repeats its match's /watch page, so only the /watch page is indexed.
  if (kind === 'scorecard') return { ...matchPage(url, data), noindex: true };
  const { teams = [], scores = [], status, raidNumber = 0 } = data.state ?? {};
  const page = matchPage(url, { teamA: teams[0]?.name, teamB: teams[1]?.name, scoreA: scores[0], scoreB: scores[1], status, tournamentId: data.tournamentId });
  // Short or unfinished matches (often tests) stay out of search; keep in step with SitemapController.MIN_RAIDS.
  return { ...page, noindex: status !== 'COMPLETED' || raidNumber < MIN_RAIDS };
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
    .replace('</head>', page.noindex ? '<meta name="robots" content="noindex, follow" />\n  </head>' : '</head>')
    // One H1 per page: the page heading below; the noscript fallback's heading becomes an H2.
    .replace(/(<noscript>[\s\S]*?)<h1>([\s\S]*?)<\/h1>/, '$1<h2>$2</h2>')
    .replace('</head>', `<script type="application/ld+json">${JSON.stringify(page.jsonLd).replace(/</g, '\\u003c')}</script>\n  </head>`)
    // React replaces #root's children on start; until then non-JS crawlers see the summary.
    .replace('<div id="root"></div>', `<div id="root"><main><h1>${escapeHtml(page.heading)}</h1><p>${d}</p>${page.body}</main></div>`);
}

export async function GET(request) {
  const url = new URL(request.url);
  const requested = url.searchParams.get('kind');
  const shell = await fetch(new URL('/index.html', url));
  // Public pages don't open the scoring app: drop its preload hints (see preloadApp in vite.config.ts).
  let html = (await shell.text()).replace(/\s*<link rel="modulepreload"[^>]*data-app-preload>/g, '');
  if (STATIC_PAGES[requested]) {
    return new Response(injectPage(html, `https://raidzon.com/${requested}`, STATIC_PAGES[requested]), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400' },
    });
  }
  const kind = ENDPOINTS[requested] ? requested : 'watch';
  const id = url.searchParams.get('id') ?? '';
  let status = 200;
  let injected = false;
  if (UUID.test(id)) {
    try {
      const response = await fetch(`${API}/api/v1/public/${ENDPOINTS[kind]}/${id}`, { signal: AbortSignal.timeout(3000) });
      const pageUrl = `https://raidzon.com/${kind}/${id}`;
      if (response.ok) { html = injectPage(html, pageUrl, pageFor(kind, pageUrl, await response.json())); injected = true; }
      else if (response.status === 404) { html = injectPage(html, '', null); status = 404; injected = true; }
    } catch {
      // Backend asleep or slow: serve the plain shell.
    }
  }
  // Only cache real answers at the CDN; a plain-shell fallback must not stick, or crawlers keep getting it.
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': injected ? 'public, max-age=0, s-maxage=60, stale-while-revalidate=300' : 'no-store' },
  });
}
