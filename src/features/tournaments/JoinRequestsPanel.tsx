import { useEffect, useState } from 'react';
import type { AccountSession } from '../identity/data/auth-client';
import { approveRequest, rejectRequest, setRegistration, STATUS_LABEL, tournamentRequests, type JoinRequest } from './data/join-requests';

/** Organizer view: review team requests and open or close registration. */
export function JoinRequestsPanel<T>({ account, online, tournamentId, registrationOpen, onDetail }: {
  account: AccountSession; online: boolean; tournamentId: string; registrationOpen: boolean; onDetail: (detail: T) => void;
}) {
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  // Shown immediately on tap; reverted if the server refuses.
  const [accepting, setAccepting] = useState(registrationOpen);
  useEffect(() => setAccepting(registrationOpen), [registrationOpen]);
  useEffect(() => {
    if (!online) return;
    let active = true;
    tournamentRequests(account, tournamentId)
      .then((rows) => { if (active && Array.isArray(rows)) setRequests(rows); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [account, online, tournamentId, reload]);

  async function run(work: () => Promise<void>) {
    setBusy(true); setError('');
    try { await work(); setReload((value) => value + 1); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save.'); }
    finally { setBusy(false); }
  }
  const pending = requests.filter((request) => request.status === 'PENDING');
  const past = requests.filter((request) => request.status !== 'PENDING');
  return (
    <section className="join-requests-review" aria-label="Team requests">
      <div className="management-heading"><div><h3>Team requests {pending.length > 0 && <span className="pending-count" aria-label={`${pending.length} pending`}>{pending.length}</span>}</h3><p>Teams asking to play. Approving copies their squad as the tournament roster.</p></div></div>
      <label className="registration-toggle">
        <input type="checkbox" checked={accepting} disabled={busy || !online}
          onChange={(event) => {
            const open = event.target.checked;
            setAccepting(open);
            void run(async () => {
              try { onDetail(await setRegistration<T>(account, tournamentId, open)); }
              catch (cause) { setAccepting(!open); throw cause; }
            });
          }} />
        Accepting team requests
      </label>
      {pending.length === 0 && <p className="field-note">No pending requests.</p>}
      {pending.map((request) => (
        <article className="join-request-card" key={request.id}>
          <header><strong>{request.teamName}</strong><small>{[request.teamCity, `${request.squadSize} players`, request.requestedByName ? `by ${request.requestedByName}` : null].filter(Boolean).join(' · ')}</small></header>
          {request.message && <p className="join-request-message">“{request.message}”</p>}
          <details><summary>Squad</summary><ol>{request.players.map((name, index) => <li key={index}>{name}</li>)}</ol></details>
          <label>Note to team <small>(optional)</small>
            <input maxLength={200} value={notes[request.id] ?? ''} disabled={busy} onChange={(event) => setNotes({ ...notes, [request.id]: event.target.value })} />
          </label>
          <div className="sync-controls">
            <button className="primary" disabled={busy || !online} onClick={() => void run(async () => onDetail(await approveRequest<T>(account, request.id, notes[request.id] ?? '')))}>Approve {request.teamName}</button>
            <button className="secondary" disabled={busy || !online} onClick={() => void run(async () => { await rejectRequest(account, request.id, notes[request.id] ?? ''); })}>Decline</button>
          </div>
        </article>
      ))}
      {error && <p className="error" role="alert">{error}</p>}
      {past.length > 0 && (
        <details className="join-request-history"><summary>Past requests ({past.length})</summary>
          {past.map((request) => <div className="join-request-row" key={request.id}><span><strong>{request.teamName}</strong><small>{STATUS_LABEL[request.status]}{request.decisionNote ? ` · “${request.decisionNote}”` : ''}</small></span></div>)}
        </details>
      )}
    </section>
  );
}
