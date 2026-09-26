import { useEffect, useRef, useState } from 'react';
import { api, ApiError, deviceCredentials, type AccountSession } from '../data/auth-client';
import { db, normalizePhone } from '../../matches/data/match-repository';
import { needsSync, syncMatch } from '../../sync/data/sync-matches';
import type { LocalMatch } from '../../scoring/domain/match-types';
import { verifyWithWidget } from '../data/widget-client';
import { clearSession, flushLogouts, restoreSession, saveSession } from '../data/session-store';
import { AccountDashboard } from './AccountDashboard';
import { ScorerAssignments } from './ScorerAssignments';

export function AccountSync({ online, matches }: { online: boolean; matches: LocalMatch[] }) {
  // Session survives reload until expiry; scoring remains available independently.
  const [account, setAccount] = useState<AccountSession | null>(null);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<{
    challengeId: string;
    expiresAt: number;
    resendAt: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [widgetAvailable, setWidgetAvailable] = useState(false);
  useEffect(() => {
    void restoreSession()
      .then(setAccount)
      .catch(() => setMessage('Unable to restore sign-in. Local scoring remains available.'));
  }, []);
  const working = useRef(false);
  async function run(work: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setMessage('');
    try {
      await work();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to connect. Your matches are saved on this device.',
      );
      if (error instanceof ApiError && error.status === 401) {
        await clearSession();
        setAccount(null);
      }
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  async function synchronize(session: AccountSession) {
    await flushLogouts();
    let count = 0;
    for (const match of await db.matches.toArray()) {
      if (!['raidzon-v2', 'raidzon-v3'].includes(match.rulesetVersion ?? '') || !needsSync(match)) continue;
      if (match.serverAccountId && match.serverAccountId !== session.accountId) continue;
      if (match.localAccountId && match.localAccountId !== session.accountId) continue;
      if (match.scoringDelegated) continue;
      await syncMatch(match.id, session);
      count++;
    }
    setMessage(
      count
        ? `${count} match${count === 1 ? '' : 'es'} synchronized.`
        : 'Your matches are up to date.',
    );
  }
  const pendingVersions = matches
    .filter(needsSync)
    .map((m) => `${m.id}:${m.version}`)
    .join('|');
  useEffect(() => {
    if (!online) return;
    const attempt = () => {
      if (account) void run(() => synchronize(account));
      else void flushLogouts().catch(() => undefined);
    };
    const timer = setTimeout(attempt, 500);
    const retry = setInterval(attempt, 15000);
    return () => {
      clearTimeout(timer);
      clearInterval(retry);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, account, pendingVersions]);
  const pending = matches.filter(needsSync).length;
  return (
    <details
      className="account-sync"
      onToggle={(event) => {
        if (event.currentTarget.open && online && !account)
          void run(async () => {
            const result = await api<{ smsAvailable: boolean; widgetAvailable?: boolean }>(
              '/auth/capabilities',
            );
            setAvailable(result.smsAvailable);
            setWidgetAvailable(result.widgetAvailable === true);
          });
      }}
    >
      <summary>
        {account ? 'Account & sync' : 'Sign in & sync'}{' '}
        <span>{pending ? `${pending} saved locally` : 'Matches saved'}</span>
      </summary>
      <p>
        Score without signing in. Sign in to claim this device’s matches and save their events to
        your account.
      </p>
      {!online && <p>You’re offline. Continue scoring; reconnect to sign in or sync.</p>}
      {account && (
        <ScorerAssignments
          key={`assignments-${account.accountId}`}
          account={account}
          online={online}
          matches={matches}
        />
      )}
      {account && (
        <AccountDashboard
          key={account.accountId}
          account={account}
          online={online}
          revision={matches.map((match) => `${match.id}:${match.serverVersion ?? -1}`).join('|')}
        />
      )}
      {account ? (
        <div className="sync-controls">
          <button disabled={!online || busy} onClick={() => void run(() => synchronize(account))}>
            {busy ? 'Syncing…' : 'Sync now'}
          </button>
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await clearSession(account);
                setAccount(null);
                setChallenge(null);
                setCode('');
                setMessage('Signed out. Local matches remain available.');
                if (online) await flushLogouts();
              })
            }
          >
            Sign out
          </button>
        </div>
      ) : widgetAvailable ? (
        <button
          disabled={!online || busy}
          onClick={() =>
            void run(async () => {
              const accessToken = await verifyWithWidget();
              const credentials = await deviceCredentials();
              const session = await api<AccountSession>('/auth/widget', {
                accessToken,
                ...credentials,
              });
              if (session.deviceId !== credentials.deviceId)
                throw new Error('Sign-in device mismatch.');
              await saveSession(session);
              setAccount(session);
            })
          }
        >
          {busy ? 'Complete phone verification…' : 'Sign in with phone'}
        </button>
      ) : available === false ? (
        <p>SMS sign-in is not enabled yet. Your matches remain safely stored on this device.</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const credentials = await deviceCredentials();
              if (challenge) {
                if (Date.now() >= challenge.expiresAt)
                  throw new Error('This code expired. Request a new code.');
                const session = await api<AccountSession>('/auth/verify', {
                  challengeId: challenge.challengeId,
                  code,
                  ...credentials,
                });
                if (session.deviceId !== credentials.deviceId)
                  throw new Error('Sign-in device mismatch.');
                await saveSession(session);
                setAccount(session);
                setCode('');
                setChallenge(null);
              } else {
                const result = await api<{
                  challengeId: string;
                  expiresAt: number;
                  resendAfterSeconds: number;
                }>('/auth/challenges', { phone: normalizePhone(phone), ...credentials });
                setChallenge({
                  ...result,
                  resendAt: Date.now() + result.resendAfterSeconds * 1000,
                });
                setMessage('Code requested. Enter the six-digit code from your SMS.');
              }
            });
          }}
        >
          <label>
            Mobile number
            <input
              type="tel"
              autoComplete="tel"
              value={phone}
              required
              disabled={!!challenge || busy}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+91"
            />
          </label>
          {challenge && (
            <label>
              Verification code
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                required
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              />
            </label>
          )}
          <div className="sync-controls">
            <button disabled={!online || busy}>
              {busy ? 'Please wait…' : challenge ? 'Verify & sync' : 'Send code'}
            </button>
            {challenge && (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => {
                  if (Date.now() < challenge.resendAt) {
                    setMessage('Please wait 60 seconds between code requests.');
                    return;
                  }
                  setChallenge(null);
                  setCode('');
                  setMessage('Enter your number and request a new code.');
                }}
              >
                Change number / new code
              </button>
            )}
          </div>
        </form>
      )}
      {message && <p role="status">{message}</p>}
      {matches
        .filter((match) => match.syncError)
        .map((match) => (
          <p className="error" key={match.id}>
            {match.name}: {match.syncError}
          </p>
        ))}
    </details>
  );
}
