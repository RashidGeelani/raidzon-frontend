import { useState } from 'react';
import { Sheet } from '../../ui/Sheet';
import { api, type AccountSession } from '../identity/data/auth-client';
import { restoreSession } from '../identity/data/session-store';

export const REPORT_REASONS = [
  { value: 'FAKE_MATCH', label: 'This match didn’t happen', hint: 'Made up to inflate stats' },
  { value: 'WRONG_SCORE', label: 'The score is wrong', hint: 'Points or result don’t match what happened' },
  { value: 'WRONG_PLAYERS', label: 'Wrong players', hint: 'Someone listed who didn’t play' },
  { value: 'OTHER', label: 'Something else', hint: '' },
] as const;
type Reason = (typeof REPORT_REASONS)[number]['value'];

/** "Report this match" link on the watch page. Signed-in viewers send one report per match. */
export function ReportMatch({ matchId }: { matchId: string }) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<AccountSession | null | undefined>(undefined);
  const [reason, setReason] = useState<Reason | ''>('');
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  function start() {
    setOpen(true);
    setError('');
    void restoreSession()
      .catch(() => null)
      .then(setSession);
  }
  async function send() {
    if (!session || !reason) return;
    setSending(true);
    setError('');
    try {
      const result = await api<{ alreadyReported: boolean }>(
        `/matches/${matchId}/reports`,
        { reason, details: details.trim() || null },
        session.token,
      );
      setDone(
        result.alreadyReported
          ? 'You’ve already reported this match. We’ll review it.'
          : 'Thanks. RaidzOn will review this match.',
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSending(false);
    }
  }
  return (
    <>
      <button type="button" className="quiet report-match-link" onClick={start}>
        ⚑ Report this match
      </button>
      {open && (
        <Sheet title="Report this match" eyebrow="REPORT" onClose={() => setOpen(false)}>
          {done ? (
            <>
              <p role="status">{done}</p>
              <p className="field-note">
                Fake or wrong matches are removed from player profiles and leaderboards.
              </p>
              <div className="report-actions">
                <button type="button" className="primary" onClick={() => setOpen(false)}>
                  Done
                </button>
              </div>
            </>
          ) : session === undefined ? (
            <p role="status">Checking your account…</p>
          ) : session === null ? (
            <>
              <p>Sign in to report a match. Reports come from signed-in players so they can be trusted.</p>
              <div className="report-actions">
                <a className="primary" href="/?tab=profile">
                  Sign in
                </a>
              </div>
            </>
          ) : (
            <>
              <fieldset className="report-reasons">
                <legend>What’s wrong?</legend>
                {REPORT_REASONS.map((item) => (
                  <label key={item.value} className={reason === item.value ? 'selected' : ''}>
                    <input
                      type="radio"
                      name="report-reason"
                      value={item.value}
                      checked={reason === item.value}
                      onChange={() => setReason(item.value)}
                    />
                    <span>
                      {item.label}
                      {item.hint && <small>{item.hint}</small>}
                    </span>
                  </label>
                ))}
              </fieldset>
              <label>
                Details (optional)
                <textarea
                  maxLength={300}
                  rows={3}
                  value={details}
                  placeholder="e.g. These teams didn’t play on this day"
                  onChange={(e) => setDetails(e.target.value)}
                />
              </label>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              <div className="report-actions">
                <button type="button" className="secondary" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button type="button" className="primary" disabled={!reason || sending} onClick={() => void send()}>
                  {sending ? 'Sending…' : 'Send report'}
                </button>
              </div>
            </>
          )}
        </Sheet>
      )}
    </>
  );
}
