import { useEffect, useState } from 'react';
import { Tabs } from '../../../ui/Tabs';
import { api } from '../../identity/data/auth-client';
import { sharedRanks } from '../domain/rank';

interface Ranking { playerId: string; name: string; matches: number; raidPoints: number; tacklePoints: number; teamName?: string | null }
type Category = 'raid' | 'tackle' | 'total';
const LABEL: Record<Category, string> = { raid: 'Raiders', tackle: 'Defenders', total: 'Total points' };

/**
 * Player rankings for one tournament from synced, completed matches. Players on zero are left
 * out and equal scores share a rank. Refreshes every 15 s while open and online.
 */
export function TournamentLeaders({ tournamentId, online }: { tournamentId: string; online: boolean }) {
  const [category, setCategory] = useState<Category>('raid');
  const [rows, setRows] = useState<Ranking[]>([]);
  const [message, setMessage] = useState('Loading rankings…');
  useEffect(() => {
    let active = true, busy = false;
    async function refresh() {
      if (busy) return;
      if (!online) { setMessage('Offline — showing the last loaded rankings.'); return; }
      busy = true;
      try {
        const result = await api<Ranking[]>(`/public/leaderboards?tournamentId=${encodeURIComponent(tournamentId)}&category=${category}`);
        if (active) { setRows(Array.isArray(result) ? result : []); setMessage(''); }
      } catch { if (active) setMessage('Rankings could not refresh. Try again in a moment.'); }
      finally { busy = false; }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => { active = false; clearInterval(timer); };
  }, [online, category, tournamentId]);
  const pointsOf = (player: Ranking) => (category === 'raid' ? player.raidPoints : category === 'tackle' ? player.tacklePoints : player.raidPoints + player.tacklePoints);
  const shown = rows.filter((player) => pointsOf(player) > 0);
  const ranks = sharedRanks(shown, pointsOf);
  return <section className="tournament-leaders" aria-label="Tournament leaders">
    <Tabs label="Leaderboard category" value={category} onChange={setCategory} items={(['raid', 'tackle', 'total'] as const).map((item) => ({ value: item, label: LABEL[item] }))} />
    {message && <p role="status">{message}</p>}
    {shown.map((player, index) => <div className="leaderboard-row" key={player.playerId}><span className="rank">{ranks[index]}</span><span className="player-avatar">{player.name.slice(0, 1)}</span><span className="leaderboard-person"><strong>{player.name}</strong><small>{[player.teamName, `${player.matches} ${player.matches === 1 ? 'match' : 'matches'}`].filter(Boolean).join(' · ')}</small></span><span className="leaderboard-points"><strong>{pointsOf(player)}</strong><small>{pointsOf(player) === 1 ? 'point' : 'points'}</small></span></div>)}
    {!message && !shown.length && <p className="list-empty">Leaders appear after the first completed match is synced.</p>}
  </section>;
}
