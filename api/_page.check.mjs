// Self-check for the public-page meta injection: node api/_page.check.mjs
// (Underscore prefix: Vercel does not deploy this as a function.)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FAQ, MIN_RAIDS, injectPage, pageFor } from './page.js';

const shell = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// Match: user-typed team names are escaped everywhere.
const url = 'https://raidzon.com/watch/x';
const html = injectPage(shell, url, pageFor('scorecard', url, { teamA: 'Tigers <script>', teamB: "Bulls & 'Co'", scoreA: 21, scoreB: 18, status: 'COMPLETED', tournamentId: 't1' }));
assert.match(html, /<title>Tigers &lt;script&gt; vs Bulls &amp; &#39;Co&#39; result · Kabaddi · RaidzOn<\/title>/);
assert.ok(!html.includes('Tigers <script>'), 'team names are escaped');
assert.equal(html.match(/raidzon\.com\/watch\/x/g).length, 3, 'canonical, og:url and JSON-LD url');
for (const tag of ['name="description"', 'property="og:title"', 'property="og:description"', 'name="twitter:title"', 'name="twitter:description"'])
  assert.match(html, new RegExp(`${tag}\\s+content="Tigers`), tag);
assert.match(html, /"@type":"SportsEvent"/);
assert.match(html, /<div id="root"><main><h1>Tigers/);
assert.match(html, /href="\/tournaments\/t1"/);

// Watch view shape (state + tournamentId).
assert.equal(pageFor('watch', url, { state: { teams: [{ name: 'A' }, { name: 'B' }], scores: [3, 4], status: 'LIVE' } }).title, 'A vs B live score · Kabaddi · RaidzOn');

// Tournament: points table rows and match links.
const tournament = injectPage(shell, 'https://raidzon.com/tournaments/t1', pageFor('tournaments', 'https://raidzon.com/tournaments/t1', {
  tournament: { name: 'Kashmir Cup', venue: 'Srinagar', startsOn: '2026-10-01' },
  teams: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }],
  fixtures: [{ teamAId: 'a', teamBId: 'b', matchId: 'm1', scoreA: 30, scoreB: 25, status: 'COMPLETED' }, { teamAId: 'a', teamBId: 'b', matchId: null }],
  standings: [{ rank: 1, teamName: 'Alpha', tablePoints: 5, played: 1, won: 1, lost: 0 }],
}));
assert.match(tournament, /<title>Kashmir Cup · Kabaddi points table/);
assert.match(tournament, /1\. Alpha: 5 pts/);
assert.match(tournament, /<a href="\/watch\/m1">Alpha 30 – 25 Beta \(final\)<\/a>/);
assert.match(tournament, /"startDate":"2026-10-01"/);

// Player: stats and tournament links.
const player = injectPage(shell, 'https://raidzon.com/players/p1', pageFor('players', 'https://raidzon.com/players/p1', {
  name: 'Ravi', matches: 4, raidPoints: 40, tacklePoints: 6, tournaments: [{ tournamentId: 't1', name: 'Kashmir Cup', matches: 4, raidPoints: 40, tacklePoints: 6 }],
}));
assert.match(player, /<title>Ravi · Kabaddi player stats · RaidzOn<\/title>/);
assert.match(player, /"@type":"Person"/);
assert.match(player, /<a href="\/tournaments\/t1">Kashmir Cup<\/a>/);

assert.match(injectPage(shell, '', null), /<meta name="robots" content="noindex" \/>/);

// Watch pages: only completed matches with enough raids are indexed; scorecards never (duplicate of /watch).
const watch = (status, raidNumber) => injectPage(shell, url, pageFor('watch', url, { state: { teams: [{ name: 'A' }, { name: 'B' }], scores: [9, 7], status, raidNumber } }));
assert.ok(!watch('COMPLETED', MIN_RAIDS).includes('noindex'), 'full match indexed');
assert.match(watch('COMPLETED', 3), /content="noindex, follow"/);
assert.match(watch('LIVE', 40), /content="noindex, follow"/);
assert.match(html, /content="noindex, follow"/, 'scorecard not indexed');
assert.equal(watch('COMPLETED', 20).match(/<h1>/g).length, 1, 'one H1');

// Match date and venue: in the summary and the JSON-LD (startDate, location) when the server sends them.
const dated = injectPage(shell, url, pageFor('watch', url, { startedAt: Date.UTC(2026, 9, 20, 10), venue: 'Srinagar', state: { teams: [{ name: 'A' }, { name: 'B' }], scores: [9, 7], status: 'COMPLETED', raidNumber: 30 } }));
assert.match(dated, /"startDate":"2026-10-20T10:00:00.000Z"/);
assert.match(dated, /"location":\{"@type":"Place","name":"Srinagar"/);
assert.match(dated, /20 Oct 2026, Srinagar/);
assert.ok(!watch('COMPLETED', 20).includes('startDate'), 'no date sent: no startDate');

// Help: FAQ in the HTML and as FAQPage JSON-LD, same questions as the app's Help page.
const appQuestions = [...readFileSync(new URL('../src/features/legal/InfoPages.tsx', import.meta.url), 'utf8')
  .split('const FAQ')[1].split('];')[0].matchAll(/\[\s*'([^']+)',/g)].map((m) => m[1]);
assert.deepEqual(FAQ.map(([q]) => q), appQuestions, 'api/page.js FAQ matches InfoPages.tsx');
console.log('page meta injection ok');
