import { useState } from 'react';
import type { AccountSession } from '../data/auth-client';
import type { LocalMatch } from '../../scoring/domain/match-types';
import { claimGuestMatches, isClaimableGuest } from '../data/claim-guest-matches';

export function GuestMatchReview({
  account,
  matches,
}: {
  account: AccountSession;
  matches: LocalMatch[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const guests = matches.filter((match) => isClaimableGuest(match, account));
  const ids = selected.filter((id) => guests.some((match) => match.id === id));
  if (!guests.length) return message ? <p role="status">{message}</p> : null;
  return (
    <section aria-label="Review guest matches">
      <h3>Review guest matches</h3>
      <p>
        Select only matches that belong to you. Selected matches will be linked to this signed-in
        account and sync when online. Unselected matches stay on this device.
      </p>
      <fieldset disabled={busy}>
        <legend>Matches saved without an account</legend>
        {guests.map((match) => (
          <label key={match.id}>
            <input
              type="checkbox"
              checked={ids.includes(match.id)}
              onChange={(event) =>
                setSelected((current) =>
                  event.target.checked
                    ? [...current, match.id]
                    : current.filter((id) => id !== match.id),
                )
              }
            />
            {match.name} · {match.state.scores.join('–')} ·{' '}
            {new Date(match.createdAt).toLocaleString()}
          </label>
        ))}
      </fieldset>
      <button
        disabled={busy || !ids.length}
        onClick={async () => {
          setBusy(true);
          setMessage('');
          try {
            await claimGuestMatches(ids, account);
            setSelected([]);
            setMessage('Selected matches added to your account. They will sync when connected.');
          } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Unable to claim matches.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Adding matches…' : `Add selected matches to my account (${ids.length})`}
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
