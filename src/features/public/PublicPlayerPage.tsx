import { useEffect, useState } from 'react';
import { api, ApiError } from '../identity/data/api';
import { playerJsonLd, setPageMeta } from '../../app/page-meta';

interface PublicPlayer {
  playerId: string;
  name: string;
  matches: number;
  raidPoints: number;
  tacklePoints: number;
  tournaments: { tournamentId: string; name: string; startsOn: string; teamName: string | null; matches: number; raidPoints: number; tacklePoints: number }[];
}

/** Signed-out player page at /players/:id: career totals from completed tournament matches (the data leaderboards already show). */
export function PublicPlayerPage({ playerId }: { playerId: string }) {
  const [player, setPlayer] = useState<PublicPlayer | null>(null);
  const [message, setMessage] = useState('Loading player…');
  useEffect(() => {
    let active = true;
    api<PublicPlayer>(`/public/players/${encodeURIComponent(playerId)}`)
      .then((result) => {
        if (!active) return;
        setPlayer(result);
        setMessage('');
        const description = `${result.name}: kabaddi player stats on RaidzOn. ${result.raidPoints} raid points and ${result.tacklePoints} tackle points in ${result.matches} tournament matches.`;
        setPageMeta(`${result.name} · Kabaddi player stats · RaidzOn`, description, playerJsonLd(result.name, description, window.location.href));
      })
      .catch((error) => {
        if (active) setMessage(error instanceof ApiError && error.status === 404 ? 'This player profile is not available.' : 'Could not load the player. Please try again.');
      });
    return () => { active = false; };
  }, [playerId]);
  return (
    <main className="info-page public-player">
      <header className="info-page-header">
        <a className="tournament-back" href="/" aria-label="Open raidzOn">←</a>
        <span className="info-page-brand">raidzOn</span>
      </header>
      {message && <p role="status">{message}</p>}
      {player && <>
        <section className="info-hero">
          <p className="eyebrow">KABADDI PLAYER</p>
          <h1>{player.name}</h1>
          <p>{player.matches} tournament {player.matches === 1 ? 'match' : 'matches'} · {player.raidPoints} raid points · {player.tacklePoints} tackle points · {player.raidPoints + player.tacklePoints} total</p>
        </section>
        <section className="info-section">
          <h2>Tournaments</h2>
          <ul className="tournament-team-list">{player.tournaments.map((item) => <li key={item.tournamentId}><span className="tournament-team-text">
            <strong><a href={`/tournaments/${item.tournamentId}`}>{item.name}</a></strong>
            <small>{[item.teamName, item.startsOn, `${item.matches} ${item.matches === 1 ? 'match' : 'matches'}`, `${item.raidPoints} raid`, `${item.tacklePoints} tackle`].filter(Boolean).join(' · ')}</small>
          </span></li>)}</ul>
        </section>
      </>}
      <footer className="info-page-footer"><a href="/">Score kabaddi on raidzOn</a><a href="/help">Help & Support</a></footer>
    </main>
  );
}
