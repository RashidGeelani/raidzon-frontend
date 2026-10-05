import { useState } from 'react';
import { api } from '../identity/data/auth-client';
export function ShareScorecard({
  matchId,
  token,
  online,
}: {
  matchId: string;
  token: string;
  online: boolean;
}) {
  const [link, setLink] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function publish(published: boolean) {
    setBusy(true);
    setMessage('');
    try {
      const result = await api<{ shareId: string }>(
        `/matches/${matchId}/scorecard`,
        { published },
        token,
      );
      setLink(published ? `${window.location.origin}/scorecard/${result.shareId}` : '');
      setMessage(
        published
          ? 'Anyone with this link can view the score.'
          : 'The scorecard link is off. Tournament matches stay visible on the tournament page.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update sharing.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button disabled={!online || busy} onClick={() => void publish(true)}>
        Share scorecard
      </button>
      <button className="secondary" disabled={!online || busy} onClick={() => void publish(false)}>
        Stop sharing
      </button>
      {link && (
        <p>
          <a href={link} target="_blank" rel="noreferrer">
            Open public scorecard
          </a>
          <input
            aria-label="Scorecard link"
            readOnly
            value={link}
            onFocus={(event) => event.currentTarget.select()}
          />
        </p>
      )}
      {message && <p>{message}</p>}
    </div>
  );
}
