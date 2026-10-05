import { useState } from 'react';
import { Sheet } from '../../../ui/Sheet';
import type { MatchState } from '../domain/match-types';

/**
 * Confirmation before the creator deletes a match that hasn't started or is paused (created by
 * mistake, abandoned, wrong teams). Deleting can't be undone.
 */
export function DeleteMatchSheet({
  state,
  events,
  synced,
  inTournament,
  onConfirm,
  onClose,
}: {
  state: MatchState;
  /** Events recorded so far, shown so the scorer knows what will be lost. */
  events: number;
  /** The match is on RaidzOn's server (watchers may be following it). */
  synced: boolean;
  inTournament: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [a, b] = state.scores;
  async function confirm() {
    setDeleting(true);
    setError('');
    try {
      await onConfirm();
    } catch (cause) {
      setError((cause as Error).message);
      setDeleting(false);
    }
  }
  return (
    <Sheet title="Delete this match?" eyebrow="DELETE MATCH" onClose={onClose}>
      <div className="end-match-score" aria-label="Current score">
        <span>{state.teams[0].name}</span>
        <strong>
          {a} – {b}
        </strong>
        <span>{state.teams[1].name}</span>
      </div>
      <ul className="delete-match-effects">
        <li>
          The match and its {events === 1 ? '1 recorded event' : `${events} recorded events`} are deleted
          {synced ? ' from this phone and from RaidzOn' : ' from this phone'}.
        </li>
        {synced && <li>Anyone watching loses the live link.</li>}
        {inTournament && <li>The tournament fixture becomes unplayed, so you can score it again.</li>}
        <li>No player stats from it are counted.</li>
      </ul>
      <p className="end-match-outcome">This can’t be undone.</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="end-match-actions">
        <button type="button" className="secondary" onClick={onClose}>
          Keep match
        </button>
        <button type="button" className="danger" disabled={deleting} onClick={() => void confirm()}>
          {deleting ? 'Deleting…' : 'Delete match'}
        </button>
      </div>
    </Sheet>
  );
}
