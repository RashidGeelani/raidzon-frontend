import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MatchSetup } from './MatchSetup';

it('prefills a prepared fixture with saved players and tournament timers', () => {
  const markup = renderToStaticMarkup(
    <MatchSetup
      session="device"
      onCreated={() => {}}
      onCancel={() => {}}
      preset={{
        tournamentId: 'tournament',
        fixtureId: 'fixture',
        teamA: 'Raiders',
        teamB: 'Defenders',
        halfMinutes: 24,
        raidSeconds: 35, // an older tournament setting is ignored: raids are always 30 seconds
        rosterA: Array.from({ length: 7 }, (_, index) => ({
          name: `Raider ${index + 1}`,
          phone: `+9198765432${index + 10}`,
        })),
        rosterB: [],
      }}
    />,
  );
  expect(markup).toContain('value="Raiders"');
  expect(markup).toContain('value="Defenders"');
  expect(markup).toContain('value="Raider 1"');
  expect(markup).toContain('value="24"');
  expect(markup).not.toContain('value="35"');
  expect(markup).toContain('Raid time: <strong>30 seconds</strong> (standard)');
});

it('restores a saved setup draft with an option to clear it', () => {
  const store = new Map([
    [
      'raidzon.setup-draft:new-match',
      JSON.stringify({
        preset: null,
        teams: [
          { name: 'Valley Raiders', players: [{ name: 'Arjun', phone: '', jersey: '7' }] },
          { name: 'City Warriors', players: [] },
        ],
        firstTurn: 1,
        halfMinutes: 15,
        practice: false,
        savedAt: 1,
      }),
    ],
  ]);
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (key: string) => store.get(key) ?? null };
  try {
    const markup = renderToStaticMarkup(<MatchSetup session="device" onCreated={() => {}} onCancel={() => {}} />);
    expect(markup).toContain('Draft restored');
    expect(markup).toContain('Clear form');
    expect(markup).toContain('value="Valley Raiders"');
    expect(markup).toContain('value="Arjun"');
    expect(markup).toContain('value="15"');
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});
