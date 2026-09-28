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
        raidSeconds: 35,
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
  expect(markup).toContain('value="35"');
});
