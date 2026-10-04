import { useEffect, useState } from 'react';
import { api, type AccountSession } from '../data/auth-client';
import { OPEN_NOTIFICATIONS } from '../../notifications/notification-client';
import { ShareScorecard } from '../../scorecard/ShareScorecard';
import { EditPlayerProfile } from './EditPlayerProfile';

interface Dashboard {
  accountId: string;
  phone: string;
  playerProfile: {
    id: string;
    name: string;
    matchCount: number;
    raidPoints: number;
    tacklePoints: number;
    superRaids: number;
    superTackles: number;
    /** Completed matches with 10+ raid points. Older servers may not send it. */
    superTens?: number;
    /** Completed matches with 5+ tackle points. */
    highFives?: number;
  } | null;
  tournamentCount: number;
  teamCount: number;
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
  const profile = data?.playerProfile;
  const displayName = profile?.name ?? 'Court organizer';
  const initials = displayName.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  return (
    <section aria-label="My account" className="account-dashboard profile-screen">
      {data && <>
        <header className="profile-hero">
          <span className="profile-avatar" aria-hidden="true">{initials}</span>
          <h2>{displayName}</h2>
          <p>{data.phone}</p>
          <span className="profile-role">🏆 Tournament Organizer</span>
        </header>
        <div className="profile-summary" aria-label="Organizer totals">
          <div><strong>{data.tournamentCount ?? 0}</strong><span>Tournaments</span></div>
          <div><strong>{data.teamCount ?? 0}</strong><span>Teams</span></div>
          <div><strong>{data.ownedMatchCount}</strong><span>Matches</span></div>
        </div>
        <section className="profile-performance" aria-label="Player performance">
          <div className="profile-section-title">
            <h3>My player profile</h3>
            <span className="milestone-tag super-ten">{profile ? `${profile.matchCount} match appearances` : 'No linked player record yet'}</span>
          </div>
          <div className="profile-performance-grid">
            <div><strong>{profile?.raidPoints ?? 0}</strong><span className="milestone-tag super-ten">Raid points</span></div>
            <div><strong>{profile?.tacklePoints ?? 0}</strong><span className="milestone-tag high-five">Tackle points</span></div>
            <div><strong>{profile?.superRaids ?? 0}</strong><span className="milestone-tag super-ten">Super raids</span></div>
            <div><strong>{profile?.superTackles ?? 0}</strong><span className="milestone-tag high-five">Super tackles</span></div>
          </div>
          <div className="profile-performance-grid profile-milestones" aria-label="Match milestones">
            <div className="super-ten">
              <em className="milestone-tag super-ten">Super 10</em>
              <strong>{profile?.superTens ?? 0}</strong>
            </div>
            <div className="high-five">
              <em className="milestone-tag high-five">High 5</em>
              <strong>{profile?.highFives ?? 0}</strong>
            </div>
          </div>
          {!profile && <p>When a team adds your verified number and that match syncs, your player stats will appear here.</p>}
        </section>
        <div className="profile-menu">
          <div className="profile-menu-row">
            <span className="profile-menu-icon" aria-hidden="true">✎</span>
            <div><strong>Edit Profile</strong><small>Update your player name</small></div>
            {profile ? <EditPlayerProfile account={account} phone={data.phone} name={profile.name} online={online} onSaved={() => setRefresh((value) => value + 1)} /> : <span className="profile-later">Link a player first</span>}
          </div>
          <button type="button" className="profile-menu-row profile-menu-link" onClick={() => window.dispatchEvent(new Event(OPEN_NOTIFICATIONS))}><span className="profile-menu-icon" aria-hidden="true">♢</span><div><strong>Notifications</strong><small>Join requests, approvals and team updates</small></div><span className="profile-menu-chevron" aria-hidden="true">›</span></button>
          <a className="profile-menu-row profile-menu-link" href="/help"><span className="profile-menu-icon" aria-hidden="true">?</span><div><strong>Help & Support</strong><small>How scoring works, FAQs and contact</small></div><span className="profile-menu-chevron" aria-hidden="true">›</span></a>
          <a className="profile-menu-row profile-menu-link" href="/privacy"><span className="profile-menu-icon" aria-hidden="true">⛉</span><div><strong>Privacy policy</strong><small>What we collect and how it is used</small></div><span className="profile-menu-chevron" aria-hidden="true">›</span></a>
        </div>
        <details className="profile-matches">
          <summary>My synced matches · {data.ownedMatchCount}</summary>
          {data.recentMatches.length ? <ul>{data.recentMatches.map((match) => <li key={match.id}>
            <strong>{match.teamA} {match.scoreA}–{match.scoreB} {match.teamB}</strong>
            <small>{match.status === 'COMPLETED' ? 'Completed' : 'In progress'} · {new Date(match.updatedAt).toLocaleString()}</small>
            <ShareScorecard matchId={match.id} token={account.token} online={online} />
          </li>)}</ul> : <p>Your synced matches will appear here.</p>}
          {data.ownedMatchCount > 20 && <p>Showing your 20 most recently updated matches.</p>}
        </details>
      </>}
      {!online && (
        <p>
          Offline —{' '}
          {data ? 'showing the last loaded account details.' : 'reconnect to load your profile.'}
        </p>
      )}
      {online && !data && !error && <p>Loading account…</p>}
      {error && <p>{error} <button className="quiet" disabled={!online} onClick={() => setRefresh((value) => value + 1)}>Try again</button></p>}
    </section>
  );
}
