import { useEffect, useRef, useState } from 'react';
import { Sheet } from '../../ui/Sheet';
import { api, type AccountSession } from '../identity/data/auth-client';
import { restoreSession } from '../identity/data/session-store';
import { liveSyncState, subscribeLiveSync, type LiveSyncState } from '../sync/data/live-sync';

export function watchLink(matchId: string) {
  return `${window.location.origin}/watch/${matchId}`;
}

type Phase = 'checking' | 'guest' | 'waiting' | 'publishing' | 'ready' | 'failed';

/**
 * Shown to the scorer the moment a match starts: makes the live scorecard public once the match
 * reaches the server, then offers a link to copy or share. Reopened from the scoring screen.
 */
export function ShareMatchPopup({
  matchId,
  online,
  onClose,
}: {
  matchId: string;
  online: boolean;
  onClose: () => void;
}) {
  const [account, setAccount] = useState<AccountSession | null | undefined>(undefined);
  const [sync, setSync] = useState<LiveSyncState | undefined>(() => liveSyncState(matchId));
  const [phase, setPhase] = useState<Phase>('checking');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const attempted = useRef(false);
  const close = useRef(onClose);
  close.current = onClose;
  const link = watchLink(matchId);

  useEffect(() => {
    let active = true;
    void restoreSession()
      .catch(() => null)
      .then((session) => {
        if (active) setAccount(session);
      });
    const stop = subscribeLiveSync(() => setSync(liveSyncState(matchId)));
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      active = false;
      stop();
      window.removeEventListener('keydown', onKey);
    };
  }, [matchId]);

  useEffect(() => {
    if (account === undefined) return;
    if (!account) {
      setPhase('guest');
      return;
    }
    if (attempted.current) return;
    if (!online || sync?.status !== 'synced') {
      setPhase('waiting');
      return;
    }
    // The match exists on the server now: make it watchable by anyone with the link.
    attempted.current = true;
    setPhase('publishing');
    api(`/matches/${matchId}/scorecard`, { published: true }, account.token)
      .then(() => setPhase('ready'))
      .catch((cause: unknown) => {
        attempted.current = false;
        setError(cause instanceof Error ? cause.message : 'Unable to make the scorecard public.');
        setPhase('failed');
      });
  }, [account, online, sync?.status, matchId, attempt]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const input = document.getElementById('share-match-link') as HTMLInputElement | null;
      input?.select();
      document.execCommand?.('copy');
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  async function share() {
    try {
      await navigator.share({
        title: 'Live kabaddi score · RaidzOn',
        text: 'Follow the match live, raid by raid:',
        url: link,
      });
    } catch {
      /* the scorer closed the share sheet */
    }
  }

  const ready = phase === 'ready';
  const note =
    phase === 'guest'
      ? 'Sign in before starting a match to share it live. This match is saved on this phone.'
      : phase === 'waiting'
        ? !online
          ? 'You are offline. The link works once this phone reconnects and uploads the match.'
          : sync?.status === 'error'
            ? sync.message
            : sync?.status === 'retrying'
              ? sync.message
              : 'Uploading the match…'
        : phase === 'publishing'
          ? 'Making the scorecard public…'
          : phase === 'failed'
            ? error
            : phase === 'ready'
              ? 'Anyone with this link sees the score update live, raid by raid.'
              : 'Preparing the link…';

  return (
    <Sheet eyebrow="MATCH STARTED" title="Share the live scorecard" onClose={onClose}>
      {phase !== 'guest' && (
        <input
          id="share-match-link"
          aria-label="Live scorecard link"
          readOnly
          value={link}
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
      <p
        className={`share-popup-note ${phase === 'failed' || sync?.status === 'error' ? 'bad' : ''}`}
      >
        {note}
      </p>
      <div className="share-popup-actions">
        {phase !== 'guest' && (
          <button className="primary" disabled={!ready} onClick={() => void copy()}>
            {copied ? 'Copied ✓' : 'Copy link'}
          </button>
        )}
        {phase !== 'guest' && typeof navigator.share === 'function' && (
          <button className="secondary" disabled={!ready} onClick={() => void share()}>
            Share…
          </button>
        )}
        {phase === 'failed' && (
          <button
            className="secondary"
            onClick={() => {
              setError('');
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </button>
        )}
        <button className="quiet" onClick={onClose}>
          {ready ? 'Done' : 'Start scoring'}
        </button>
      </div>
    </Sheet>
  );
}
