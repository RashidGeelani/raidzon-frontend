import { useEffect, useState } from 'react';
import { api, ApiError } from '../identity/data/auth-client';
interface Scorecard {
  shareId: string;
  teamA: string;
  teamB: string;
  scoreA: number;
  scoreB: number;
  tieScoreA: number;
  tieScoreB: number;
  status: string;
  phase: string;
  half: number;
  raidNumber: number;
  winner: string | null;
  version: number;
  lastSyncedAt: number;
}
export function PublicScorecard({ shareId }: { shareId: string }) {
  const [score, setScore] = useState<Scorecard | null>(null);
  const [message, setMessage] = useState('Loading scorecard…');
  useEffect(() => {
    let active = true,
      busy = false;
    async function refresh() {
      if (busy) return;
      busy = true;
      try {
        const result = await api<Scorecard>(`/public/scorecards/${encodeURIComponent(shareId)}`);
        if (active) {
          setScore(result);
          setMessage('');
        }
      } catch (error) {
        if (active) {
          if (error instanceof ApiError && error.status === 404) {
            setScore(null);
            setMessage('This scorecard is unavailable or no longer shared.');
          } else setMessage('Updates are delayed. Showing the last received score when available.');
        }
      } finally {
        busy = false;
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    window.addEventListener('online', refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('online', refresh);
    };
  }, [shareId]);
  return (
    <main className="public-scorecard">
      <img src="/brand/raidzon-logo-256.webp" alt="raidzOn" width="120" />
      <h1>Match scorecard</h1>
      {score && (
        <>
          <p>
            {score.status === 'COMPLETED' ? 'Final score' : 'Match in progress'} · Half {score.half}{' '}
            · Raid {score.raidNumber}
          </p>
          <div className="public-score">
            <span>{score.teamA}</span>
            <strong>
              {score.scoreA} – {score.scoreB}
            </strong>
            <span>{score.teamB}</span>
          </div>
          {score.phase !== 'REGULATION' && (
            <p>
              Tie-break: {score.tieScoreA} – {score.tieScoreB}
            </p>
          )}
          {score.winner && (
            <p>
              {score.winner === 'TEAM_A'
                ? `${score.teamA} wins`
                : score.winner === 'TEAM_B'
                  ? `${score.teamB} wins`
                  : 'Match tied'}
            </p>
          )}
          <p>
            Last score synced:{' '}
            <time dateTime={new Date(score.lastSyncedAt).toISOString()}>
              {new Date(score.lastSyncedAt).toLocaleString()}
            </time>
          </p>
          <p>
            Scores update after the scorer’s device syncs. During an internet outage, this page
            retains the last synced score.
          </p>
        </>
      )}
      {message && <p role="status">{message}</p>}
      <a href="/">Open raidzOn</a>
    </main>
  );
}
