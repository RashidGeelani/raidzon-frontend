import { useState } from 'react';
import { Tabs } from '../../../ui/Tabs';
import type { LocalMatch } from '../domain/match-types';
import { sharedRanks } from '../domain/rank';

type Category = 'Raiders' | 'Defenders' | 'Total';

export function LocalLeaderboards({ matches }: { matches: LocalMatch[] }) {
  const [category, setCategory] = useState<Category>('Raiders');
  const players = new Map<string, { name: string; team: string; raid: number; tackle: number }>();
  for (const match of matches) {
    if (match.practice) continue; // practice matches never count towards leaderboards
    for (const team of match.state.teams) {
      for (const player of team.players) {
        // Players without a phone are told apart by team and name.
        const key = player.phone || `${team.name.toLowerCase()}:${player.name.trim().toLowerCase()}`;
        const current = players.get(key) ?? {
          name: player.name,
          team: team.name,
          raid: 0,
          tackle: 0,
        };
        current.raid += player.raidPoints;
        current.tackle += player.tacklePoints;
        players.set(key, current);
      }
    }
  }
  const points = (player: { raid: number; tackle: number }) =>
    category === 'Raiders' ? player.raid : category === 'Defenders' ? player.tackle : player.raid + player.tackle;
  const ranked = [...players.values()].filter((player) => points(player) > 0).sort((a, b) => points(b) - points(a) || a.name.localeCompare(b.name));
  const ranks = sharedRanks(ranked, points);
  return (
    <section className="leaderboard-screen" aria-label="Local leaderboards">
      <Tabs
        label="Leaderboard category"
        value={category}
        onChange={setCategory}
        items={(['Raiders', 'Defenders', 'Total'] as const).map((item) => ({ value: item, label: item === 'Total' ? 'Top players' : item }))}
      />
      {ranked.length ? (
        <div className="leaderboard-list">
          {ranked.map((player, index) => (
            <div className="leaderboard-row" key={`${player.team}:${player.name}:${index}`}>
              <span className="rank">{ranks[index]}</span>
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
