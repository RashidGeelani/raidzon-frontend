import { useEffect, useRef, useState } from 'react';
import { api, ApiError, deviceCredentials, type AccountSession } from '../data/auth-client';
import { db, normalizePhone } from '../../matches/data/match-repository';
import { needsSync, syncMatch } from '../../sync/data/sync-matches';
import type { LocalMatch } from '../../scoring/domain/match-types';
import { verifyWithWidget } from '../data/widget-client';
import { clearSession, flushLogouts, restoreSession, saveSession } from '../data/session-store';
import { AccountDashboard } from './AccountDashboard';
import { claimDeviceGuestMatches, isClaimableGuest } from '../data/claim-guest-matches';
import { TournamentExplorer } from '../../tournaments/TournamentExplorer';
import type { PreparedFixture } from '../../tournaments/types';

export function AccountSync({
  online,
  matches,
  onPrepareFixture,
  onScoreMatch,
  section = 'all',
}: {
  online: boolean;
  matches: LocalMatch[];
  onPrepareFixture: (fixture: PreparedFixture) => void;
  onScoreMatch?: (id: string) => void;
  section?: 'all' | 'tournaments' | 'profile';
}) {
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
  useEffect(() => {
    if (!online || account) return;
    void api<{ smsAvailable: boolean; widgetAvailable?: boolean }>('/auth/capabilities')
      .then((result) => {
        setAvailable(result.smsAvailable);
        setWidgetAvailable(result.widgetAvailable === true);
      })
      .catch(() => setAvailable(null));
  }, [online, account]);
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
        await clearSession(account ?? undefined);
        setAccount(null);
      }
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  async function synchronize(session: AccountSession) {
    await flushLogouts().catch(() => undefined);
    await claimDeviceGuestMatches(session);
    let count = 0;
    let failed = 0;
    for (const match of await db.matches.toArray()) {
      if (!['raidzon-v2', 'raidzon-v3'].includes(match.rulesetVersion ?? '') || !needsSync(match))
        continue;
      if (match.serverAccountId && match.serverAccountId !== session.accountId) continue;
      if (match.localAccountId && match.localAccountId !== session.accountId) continue;
      if (match.scoringDelegated) continue;
      if (match.ownerSessionId !== session.deviceId) continue;
      if (!match.localAccountId && !match.serverAccountId) continue;
      try {
        await syncMatch(match.id, session);
        count++;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) throw error;
        failed++;
      }
    }
    setMessage(
      failed
        ? `${failed} match${failed === 1 ? '' : 'es'} could not sync yet. Saved scores remain on this device.`
        : count
        ? `${count} match${count === 1 ? '' : 'es'} synchronized.`
        : 'Your matches are up to date.',
    );
  }
  const pendingVersions = matches
    .filter(needsSync)
    .map((m) => `${m.id}:${m.version}:${m.localAccountId ?? ''}`)
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
  const pending = account
    ? matches.filter((match) =>
        isClaimableGuest(match, account) ||
        (needsSync(match) &&
          (match.localAccountId === account.accountId || match.serverAccountId === account.accountId)),
      ).length
    : 0;
  return (
    <section className={`account-sync ${section === 'profile' ? 'account-sync-profile' : section === 'tournaments' ? 'account-sync-tournaments' : ''}`}>
      <h2>{section === 'tournaments' ? 'My tournaments' : account ? 'Your account' : 'Sign in'}</h2>
      {!account && section === 'profile' && (
        <div className="profile-guest" aria-label="Signed-out profile">
          <span className="profile-avatar" aria-hidden="true">G</span>
          <h2>Your raidzOn profile</h2>
          <p>Sign in with your phone to see your tournaments, teams, matches, and player performance.</p>
          <span className="profile-role">Guest scorer</span>
        </div>
      )}
      {!account && section === 'all' && <p>Score offline at any time. Sign in to back up matches from this device automatically when connected.</p>}
      {account && <p role="status">{pending ? `${pending} match${pending === 1 ? '' : 'es'} waiting to sync` : 'Matches are up to date'} · {online ? 'Online' : 'Offline'}</p>}
      {!online && <p>You’re offline. Continue scoring; reconnect to sign in or sync.</p>}
      {account && section === 'profile' && (
        <AccountDashboard
          key={account.accountId}
          account={account}
          online={online}
          revision={matches.map((match) => `${match.id}:${match.serverVersion ?? -1}`).join('|')}
        />
      )}
      {section === 'tournaments' ? (
        <TournamentExplorer
          key={`tournaments-${account?.accountId ?? 'guest'}`}
          account={account}
          online={online}
          matches={matches}
          onPrepareFixture={onPrepareFixture}
          onScoreMatch={onScoreMatch}
        />
      ) : null}
      {account ? (
        <div className="sync-controls">
          {busy && <span>Syncing saved matches…</span>}
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
          className="primary"
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
        <p className="profile-signin-note">Phone sign-in is temporarily unavailable. You can still score offline; your matches stay saved on this device.</p>
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
            <button className="primary" disabled={!online || busy}>
              {busy ? 'Please wait…' : challenge ? 'Sign in' : 'Send code'}
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
    </section>
  );
}
