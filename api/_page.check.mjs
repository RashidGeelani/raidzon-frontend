// Self-check for the public-page meta injection: node api/_page.check.mjs
// (Underscore prefix: Vercel does not deploy this as a function.)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { injectPage, pageFor } from './page.js';

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
console.log('page meta injection ok');
