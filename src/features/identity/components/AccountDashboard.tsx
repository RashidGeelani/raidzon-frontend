import { useEffect, useState } from 'react';
import { api, type AccountSession } from '../data/auth-client';
import { ShareScorecard } from '../../scorecard/ShareScorecard';
import { EditPlayerProfile } from './EditPlayerProfile';

interface Dashboard {
  accountId: string;
  phone: string;
  playerProfile: { id: string; name: string; matchCount: number } | null;
  ownedMatchCount: number;
  recentMatches: {
    id: string;
    teamA: string;
    teamB: string;
    status: string;
    scoreA: number;
    scoreB: number;
    updatedAt: number;
  }[];
}
export function AccountDashboard({
  account,
  online,
  revision,
}: {
  account: AccountSession;
  online: boolean;
  revision: string;
}) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!online) return;
    let active = true;
    void api<Dashboard>('/account/dashboard', undefined, account.token)
      .then((result) => {
        if (!active) return;
        if (result.accountId !== account.accountId)
          throw new Error('Account response did not match this session.');
        setData(result);
        setError('');
      })
      .catch(() => {
        if (active) setError('Unable to load your account. Local scoring is still available.');
      });
    return () => {
      active = false;
    };
  }, [account.accountId, account.token, online, revision, refresh]);
  return (
    <section aria-label="My account" className="account-dashboard">
      <h3>My account</h3>
      {data && (
        <>
          <p>Verified phone: {data.phone}</p>
          <h4>My player profile</h4>
          {data.playerProfile ? (
            <p>
              <strong>{data.playerProfile.name}</strong>
              <br />
              {data.playerProfile.matchCount} synced match appearances
            </p>
          ) : (
            <p>
              No player record is linked yet. Once a team adds your verified number and its match
              syncs, your player record will appear here.
            </p>
          )}
          {data.playerProfile && (
            <EditPlayerProfile
              account={account}
              phone={data.phone}
              name={data.playerProfile.name}
              online={online}
              onSaved={() => setRefresh((value) => value + 1)}
            />
          )}
          <h4>My synced matches · {data.ownedMatchCount}</h4>
          {data.recentMatches.length ? (
            <ul>
              {data.recentMatches.map((match) => (
                <li key={match.id}>
                  <strong>
                    {match.teamA} {match.scoreA}–{match.scoreB} {match.teamB}
                  </strong>
                  <br />
                  {match.status === 'COMPLETED' ? 'Completed' : 'In progress'} ·{' '}
                  {new Date(match.updatedAt).toLocaleString()}
                  <ShareScorecard matchId={match.id} token={account.token} online={online} />
                </li>
              ))}
            </ul>
          ) : (
            <p>Your synced matches will appear here.</p>
          )}
          {data.ownedMatchCount > 20 && <p>Showing your 20 most recently updated matches.</p>}
        </>
      )}
      {!online && (
        <p>
          Offline —{' '}
          {data ? 'showing the last loaded account details.' : 'reconnect to load your profile.'}
        </p>
      )}
      {online && !data && !error && <p>Loading account…</p>}
      {error && <p>{error}</p>}
      <button
        className="secondary"
        disabled={!online}
        onClick={() => setRefresh((value) => value + 1)}
      >
        Refresh account
      </button>
    </section>
  );
}
