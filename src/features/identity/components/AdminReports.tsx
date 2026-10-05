import { useState } from 'react';
import { api, type AccountSession } from '../data/auth-client';
import { REPORT_REASONS } from '../../scorecard/ReportMatch';

export interface AdminMatch {
  id: string;
  teamA: string;
  teamB: string;
  scoreA: number;
  scoreB: number;
  status: string;
  practice: boolean;
  tournamentName: string | null;
  ownerPhone: string;
  createdAt: number;
  removedAt: number | null;
  removedReason: string | null;
  openReports: number;
  reasons: string[];
  details: string[];
  latestReportAt: number | null;
}

const reasonLabel = (value: string) => REPORT_REASONS.find((item) => item.value === value)?.label ?? value;
const MATCH_ID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

/** Admin tools on the Profile tab: review reported matches and remove fake ones. */
export function AdminReports({ account, online }: { account: AccountSession; online: boolean }) {
  const [items, setItems] = useState<AdminMatch[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lookup, setLookup] = useState('');
  async function load() {
    setLoading(true);
    setError('');
    try {
      setItems(await api<AdminMatch[]>('/admin/reports', undefined, account.token));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function find() {
    const id = lookup.match(MATCH_ID)?.[1];
    if (!id) {
      setError('Paste a watch link or match ID.');
      return;
    }
    setError('');
    try {
      const found = await api<AdminMatch>(`/admin/matches/${id}`, undefined, account.token);
      setItems((current) => [found, ...(current ?? []).filter((item) => item.id !== found.id)]);
      setLookup('');
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  const replace = (next: AdminMatch) =>
    setItems((current) => (current ?? []).map((item) => (item.id === next.id ? next : item)));
  return (
    <details
      className="profile-matches admin-reports"
      onToggle={(event) => {
        if ((event.currentTarget as HTMLDetailsElement).open && !items && online) void load();
      }}
    >
      <summary>Admin · Match reports{items ? ` · ${items.filter((item) => item.openReports > 0).length} open` : ''}</summary>
      <p className="field-note">
        Removing a match hides it from watchers and shared scorecards, takes it out of player stats and
        leaderboards, and unlinks it from its tournament fixture. The organizer is notified.
      </p>
      <form
        className="admin-lookup"
        onSubmit={(event) => {
          event.preventDefault();
          void find();
        }}
      >
        <input
          aria-label="Watch link or match ID"
          placeholder="Paste a watch link or match ID"
          value={lookup}
          onChange={(e) => setLookup(e.target.value)}
        />
        <button className="secondary" disabled={!online || !lookup.trim()}>
          Find
        </button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {loading && <p>Loading reports…</p>}
      {items && !items.length && <p>No open reports.</p>}
      {items && items.length > 0 && (
        <ul className="admin-report-list">
          {items.map((item) => (
            <AdminMatchCard key={item.id} item={item} account={account} online={online} onChange={replace} />
          ))}
        </ul>
      )}
      {items && (
        <button type="button" className="quiet" disabled={!online || loading} onClick={() => void load()}>
          Refresh
        </button>
      )}
    </details>
  );
}

function AdminMatchCard({
  item,
  account,
  online,
  onChange,
}: {
  item: AdminMatch;
  account: AccountSession;
  online: boolean;
  onChange: (next: AdminMatch) => void;
}) {
  const [removing, setRemoving] = useState(false);
  const [reason, setReason] = useState('Fake match');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function act(path: string, body: unknown = {}) {
    setBusy(true);
    setError('');
    try {
      onChange(await api<AdminMatch>(`/admin/matches/${item.id}/${path}`, body, account.token));
      setRemoving(false);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className={`admin-report ${item.removedAt ? 'removed' : ''}`}>
      <div className="admin-report-head">
        <strong>
          {item.teamA} {item.scoreA}–{item.scoreB} {item.teamB}
        </strong>
        {item.openReports > 0 && (
          <span className="admin-report-count">
            {item.openReports} report{item.openReports === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <small>
        {item.tournamentName ?? 'Not in a tournament'} · {item.status.replaceAll('_', ' ').toLowerCase()} ·
        organizer {item.ownerPhone} · {new Date(item.createdAt).toLocaleDateString()}
        {item.practice ? ' · practice' : ''}
      </small>
      {item.reasons.length > 0 && <p className="admin-report-reasons">{item.reasons.map(reasonLabel).join(' · ')}</p>}
      {item.details.map((text, index) => (
        <blockquote key={index}>“{text}”</blockquote>
      ))}
      {item.removedAt && (
        <p className="admin-report-removed">
          Removed {new Date(item.removedAt).toLocaleDateString()} · {item.removedReason}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {removing ? (
        <div className="admin-remove">
          <label>
            Reason (the organizer sees this)
            <input maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="admin-report-actions">
            <button type="button" className="secondary" onClick={() => setRemoving(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="danger"
              disabled={busy || !online || !reason.trim()}
              onClick={() => void act('remove', { reason: reason.trim() })}
            >
              {busy ? 'Removing…' : 'Remove match'}
            </button>
          </div>
        </div>
      ) : (
        <div className="admin-report-actions">
          {!item.removedAt && (
            <a className="quiet" href={`/watch/${item.id}`} target="_blank" rel="noreferrer">
              Watch
            </a>
          )}
          {item.openReports > 0 && (
            <button type="button" className="secondary" disabled={busy || !online} onClick={() => void act('dismiss')}>
              Dismiss
            </button>
          )}
          {item.removedAt ? (
            <button type="button" className="secondary" disabled={busy || !online} onClick={() => void act('restore')}>
              Restore
            </button>
          ) : (
            <button type="button" className="danger" disabled={!online} onClick={() => setRemoving(true)}>
              Remove…
            </button>
          )}
        </div>
      )}
    </li>
  );
}
