import { useEffect, useState } from 'react';
import type { AccountSession } from '../identity/data/auth-client';
import { cachedTeams, refreshTeamCache, type TeamDetail } from '../teams/data/team-client';
import { latestByTeam, requestToJoin, STATUS_LABEL, teamRequests, withdrawRequest, type JoinRequest } from './data/join-requests';

/** On a public tournament page: lets a team owner or manager ask the organizer for a place. */
export function RequestToJoin({ account, online, tournamentId, registrationOpen }: {
  account: AccountSession | null; online: boolean; tournamentId: string; registrationOpen: boolean;
}) {
  const [teams, setTeams] = useState<TeamDetail[]>([]);
  const [requests, setRequests] = useState<Map<string, JoinRequest>>(new Map());
  const [teamId, setTeamId] = useState('');
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!account) return;
    let active = true;
    void (async () => {
      const load = async () => (await cachedTeams(account.accountId)).filter((team) => team.myRole !== 'COACH');
      let eligible = await load();
      if (online) {
        await refreshTeamCache(account).catch(() => undefined);
        eligible = await load();
      }
      if (!active) return;
      setTeams(eligible);
      if (!online) return;
      const lists = await Promise.all(eligible.slice(0, 10).map((team) => teamRequests(account, team.id).catch(() => [] as JoinRequest[])));
      const forThis = lists.flat().filter((request) => request && request.tournamentId === tournamentId);
      if (active) setRequests(latestByTeam(forThis));
    })().catch(() => undefined);
    return () => { active = false; };
  }, [account, online, tournamentId]);

  if (!account)
    return <section className="join-request-panel" aria-label="Play in this tournament"><h3>Play in this tournament</h3><p className="field-note">Sign in to request a place for your team.</p></section>;

  const open = (team: TeamDetail) => { const status = requests.get(team.id)?.status; return status !== 'PENDING' && status !== 'APPROVED'; };
  const choices = teams.filter((team) => open(team) && team.members.length >= 7 && !team.archived);
  async function send() {
    if (!account || !teamId) return;
    setBusy(true); setNotice('');
    try {
      const created = await requestToJoin(account, tournamentId, teamId, message);
      setRequests((current) => new Map(current).set(created.teamId, created));
      setTeamId(''); setMessage('');
      setNotice('Request sent. The organizer will review your squad.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to send the request.');
    } finally { setBusy(false); }
  }
  async function withdraw(request: JoinRequest) {
    if (!account) return;
    setBusy(true); setNotice('');
    try {
      const updated = await withdrawRequest(account, request.id);
      setRequests((current) => new Map(current).set(updated.teamId, updated));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to withdraw.');
    } finally { setBusy(false); }
  }
  const mine = [...requests.values()];
  return (
    <section className="join-request-panel" aria-label="Play in this tournament">
      <h3>Play in this tournament</h3>
      {mine.map((request) => (
        <div className={`join-request-row join-${request.status.toLowerCase()}`} key={request.id}>
          <span><strong>{request.teamName}</strong><small>{STATUS_LABEL[request.status]}{request.decisionNote ? ` · “${request.decisionNote}”` : ''}</small></span>
          {request.status === 'PENDING' && <button className="quiet" disabled={busy || !online} onClick={() => void withdraw(request)}>Withdraw</button>}
        </div>
      ))}
      {!registrationOpen ? (
        <p className="field-note">The organizer isn’t accepting team requests right now.</p>
      ) : teams.length === 0 ? (
        <p className="field-note">Create a team with at least 7 players on the Teams tab, then request a place here.</p>
      ) : choices.length === 0 ? null : (
        <form className="join-request-form" onSubmit={(event) => { event.preventDefault(); void send(); }}>
          <label>Team
            <select value={teamId} required disabled={busy || !online} onChange={(event) => setTeamId(event.target.value)}>
              <option value="">Choose your team</option>
              {choices.map((team) => <option key={team.id} value={team.id}>{team.name} ({team.members.length} players)</option>)}
            </select>
          </label>
          <label>Message to organizer <small>(optional)</small>
            <textarea maxLength={200} rows={2} value={message} disabled={busy || !online} onChange={(event) => setMessage(event.target.value)} />
          </label>
          <p className="field-note">The organizer sees your team name and player names. Phone numbers are shared only if they approve.</p>
          <button className="primary" disabled={busy || !online || !teamId}>Send request</button>
        </form>
      )}
      {notice && <p className="field-note join-request-notice">{notice}</p>}
    </section>
  );
}
