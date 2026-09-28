import { useState } from 'react';
import type { LocalMatch } from '../domain/match-types';

type Category = 'Raiders' | 'Defenders' | 'Total';

export function LocalLeaderboards({ matches }: { matches: LocalMatch[] }) {
  const [category, setCategory] = useState<Category>('Raiders');
  const players = new Map<string, { name: string; team: string; raid: number; tackle: number }>();
  for (const match of matches) {
    for (const team of match.state.teams) {
      for (const player of team.players) {
        const current = players.get(player.phone) ?? {
          name: player.name,
          team: team.name,
          raid: 0,
          tackle: 0,
        };
        current.raid += player.raidPoints;
        current.tackle += player.tacklePoints;
        players.set(player.phone, current);
      }
    }
  }
  const points = (player: { raid: number; tackle: number }) =>
    category === 'Raiders' ? player.raid : category === 'Defenders' ? player.tackle : player.raid + player.tackle;
  const ranked = [...players.values()].sort((a, b) => points(b) - points(a) || a.name.localeCompare(b.name));
  return (
    <section className="leaderboard-screen" aria-label="Local leaderboards">
      <div className="section-heading">
        <div>
          <h1>Leaderboards</h1>
          <p>Player rankings from matches saved on this device</p>
        </div>
      </div>
      <div className="tab-strip" role="tablist" aria-label="Leaderboard category">
        {(['Raiders', 'Defenders', 'Total'] as const).map((item) => (
          <button
            key={item}
            role="tab"
            aria-selected={category === item}
            className={category === item ? 'active' : ''}
            onClick={() => setCategory(item)}
          >
            {item === 'Total' ? 'MVP' : item}
          </button>
        ))}
      </div>
      {ranked.length ? (
        <div className="leaderboard-list">
          {ranked.map((player, index) => (
            <div className="leaderboard-row" key={`${player.team}:${player.name}:${index}`}>
              <span className="rank">{String(index + 1).padStart(2, '0')}</span>
              <span className="player-avatar">{player.name.slice(0, 1).toUpperCase()}</span>
              <span className="leaderboard-person"><strong>{player.name}</strong><small>{player.team}</small></span>
              <span className="leaderboard-points"><strong>{points(player)}</strong><small>{category === 'Total' ? 'Total' : category === 'Raiders' ? 'Raid' : 'Tackle'} pts</small></span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h3>No player points yet</h3>
          <p>Score a match and player rankings will appear here, even offline.</p>
        </div>
      )}
    </section>
  );
}
