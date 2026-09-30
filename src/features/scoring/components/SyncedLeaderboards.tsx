import { useEffect, useState } from 'react';
import { api } from '../../identity/data/auth-client';
import { LocalLeaderboards } from './LocalLeaderboards';
import type { LocalMatch } from '../domain/match-types';

interface Ranking { playerId: string; name: string; matches: number; raidPoints: number; tacklePoints: number }
export function SyncedLeaderboards({ matches, online }: { matches: LocalMatch[]; online: boolean }) {
  const [local, setLocal] = useState(false);
  const [category, setCategory] = useState<'raid' | 'tackle' | 'total'>('raid');
  const [rows, setRows] = useState<Ranking[]>([]);
  const [message, setMessage] = useState('Loading rankings…');
  const revision = matches.map((match) => `${match.id}:${match.serverVersion}`).join('|');
  useEffect(() => {
    let active = true, busy = false;
    async function refresh() {
      if (busy || local) return;
      if (!online) { setMessage('Offline — showing the last loaded synced rankings.'); return; }
      busy = true;
      try {
        const result = await api<Ranking[]>(`/public/leaderboards?category=${category}`);
        if (active) { setRows(result); setMessage(''); }
      } catch { if (active) setMessage('Rankings could not refresh. Local results are available under On this device.'); }
      finally { busy = false; }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => { active = false; clearInterval(timer); };
  }, [online, category, local, revision]);
  return <section>
    <div className="list-filter-tabs"><button className={!local ? 'active' : ''} onClick={() => setLocal(false)}>Synced results</button><button className={local ? 'active' : ''} onClick={() => setLocal(true)}>On this device</button></div>
    {local ? <LocalLeaderboards matches={matches} /> : <>
      <header className="list-screen-heading"><h2>Leaderboards</h2><p>Completed tournament matches · updates automatically after sync</p></header>
      <div className="list-filter-tabs" aria-label="Synced leaderboard category">{(['raid', 'tackle', 'total'] as const).map((item) => <button key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item === 'raid' ? 'Raiders' : item === 'tackle' ? 'Defenders' : 'Total points'}</button>)}</div>
      {message && <p role="status">{message}</p>}
      {rows.map((player, index) => <div className="leaderboard-row" key={player.playerId}><span className="rank">{index + 1}</span><span className="player-avatar">{player.name.slice(0, 1)}</span><span className="leaderboard-person"><strong>{player.name}</strong><small>{player.matches} matches</small></span><span className="leaderboard-points"><strong>{category === 'raid' ? player.raidPoints : category === 'tackle' ? player.tacklePoints : player.raidPoints + player.tacklePoints}</strong><small>points</small></span></div>)}
      {!message && !rows.length && <p className="list-empty">Rankings appear when a completed tournament match syncs.</p>}
    </>}
  </section>;
}
