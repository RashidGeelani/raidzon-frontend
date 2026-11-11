import { useEffect, useState } from 'react';
import { api, ApiError, deviceCredentials, type AccountSession } from '../identity/data/auth-client';
import { restoreSession } from '../identity/data/session-store';
import { WidgetPhoneSignIn } from '../identity/components/WidgetPhoneSignIn';
import { Sheet } from '../../ui/Sheet';
import { eventLabel, plural } from '../scoring/domain/event-label';
import type { LocalMatch, MatchEvent } from '../scoring/domain/match-types';
import { continueScoringHere, unsentTaps } from './data/takeover';

type Step = 'explain' | 'code' | 'working';

/** A plain list of taps that never reached the server, so nobody has to guess what is missing. */
export function UnsentTapList({ taps }: { taps: Pick<MatchEvent, 'id' | 'summary' | 'createdAt'>[] }) {
  return (
    <ol className="handover-taps">
      {taps.map((tap) => (
        <li key={tap.id}>
          <span>{eventLabel(tap.summary)}</span>
          <small>{new Date(tap.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
        </li>
      ))}
    </ol>
  );
}

/**
 * "Continue scoring here": explains what happens, confirms with a fresh code to the account's phone,
 * then rebuilds the match on this phone and checks it against the server before scoring is enabled.
 */
export function ContinueScoringHere({
  matchId,
  title,
  online,
  phone: knownPhone,
  label = 'Continue scoring here',
  onDone,
}: {
  matchId: string;
  title: string;
  online: boolean;
  phone?: string;
  label?: string;
  onDone: (matchId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('explain');
  const [account, setAccount] = useState<AccountSession | null>(null);
  const [phone, setPhone] = useState(knownPhone ?? '');
  const [localTaps, setLocalTaps] = useState<MatchEvent[]>([]);
  const [widget, setWidget] = useState(false);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  /** The server already moved scoring here but this phone couldn't finish: retry without another code. */
  const [movedHere, setMovedHere] = useState(false);
  useEffect(() => {
    if (!open) return;
    let active = true;
    void Promise.all([
      restoreSession().catch(() => null),
      unsentTaps(matchId).catch(() => []),
      api<{ widgetAvailable?: boolean }>('/auth/capabilities').catch(() => ({ widgetAvailable: false })),
    ]).then(async ([session, taps, capabilities]) => {
      if (!active) return;
      setAccount(session);
      setLocalTaps(taps);
      setWidget(capabilities.widgetAvailable === true);
      if (session && !knownPhone) {
        const dashboard = await api<{ phone: string }>('/account/dashboard', undefined, session.token).catch(() => null);
        if (active && dashboard) setPhone(dashboard.phone);
      }
    });
    return () => {
      active = false;
    };
  }, [open, matchId, knownPhone]);
  function close() {
    setOpen(false);
    setStep('explain');
    setChallenge(null);
    setCode('');
    setMessage('');
  }
  async function move(proofToken?: string) {
    if (!account) throw new Error('Sign in again, then try once more.');
    setStep('working');
    try {
      await continueScoringHere(matchId, account, proofToken);
      close();
      onDone(matchId);
    } catch (error) {
      if (!(error instanceof ApiError)) setMovedHere(true);
      setStep(proofToken || movedHere ? 'code' : 'explain');
      throw error;
    }
  }
  /** Exchanges a fresh verification for a one-time proof, uses it, and always signs the proof out. */
  async function withProof(proof: AccountSession) {
    try {
      if (!account || proof.accountId !== account.accountId || proof.deviceId !== account.deviceId)
        throw new Error('Verify the same phone number you are signed in with.');
      await move(proof.token);
    } finally {
      await api('/auth/logout', {}, proof.token).catch(() => undefined);
    }
  }
  async function attempt(work: () => Promise<void>) {
    setMessage('');
    try {
      await work();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The match could not be moved. Try again.');
    }
  }
  async function sendCode() {
    if (!phone) throw new Error('Your phone number could not be loaded. Check your connection and try again.');
    const device = await deviceCredentials();
    const result = await api<{ challengeId: string }>('/auth/challenges', { phone, ...device });
    setChallenge(result.challengeId);
    setStep('code');
  }
  async function checkCode() {
    const device = await deviceCredentials();
    await withProof(await api<AccountSession>('/auth/verify', { challengeId: challenge, code, ...device }));
  }
  return (
    <>
      <button type="button" className="handover-button" disabled={!online} onClick={() => setOpen(true)}>
        {label}
      </button>
      {!online && <small className="field-note">You need internet to move a match to this phone.</small>}
      {open && (
        <Sheet title="Continue scoring on this phone?" eyebrow={title} onClose={step === 'working' ? () => undefined : close}>
          <div className="handover-sheet">
            {step === 'working' ? (
              <p role="status">Moving the match and checking every raid...</p>
            ) : movedHere ? (
              <>
                <p>This phone now scores the match, but it could not finish loading it.</p>
                <button type="button" className="handover-button" disabled={!online} onClick={() => void attempt(() => move())}>
                  Try loading it again
                </button>
              </>
            ) : step === 'explain' ? (
              <>
                <p>Use this if the other phone is lost, broken or out of charge, or if you want to carry on here.</p>
                <ul className="handover-points">
                  <li>The other phone will stop scoring this match straight away.</li>
                  <li className="handover-warning">
                    Taps on the other phone that were never uploaded will <strong>not</strong> be added. If the other
                    phone still works, connect it to the internet first and wait until it shows Live.
                  </li>
                  <li>People watching the match will not notice any break.</li>
                </ul>
                {localTaps.length > 0 && (
                  <div className="handover-warning">
                    <p>{`This phone also has ${plural(localTaps.length, 'tap')} that never reached the server. They will be replaced by the score saved online:`}</p>
                    <UnsentTapList taps={localTaps} />
                  </div>
                )}
                {!online ? (
                  <p className="field-note">You need internet to move a match to this phone.</p>
                ) : !account ? (
                  <p className="field-note">Sign in with the account that scores this match first.</p>
                ) : widget ? (
                  <WidgetPhoneSignIn
                    online={online}
                    fixedPhone={phone || undefined}
                    sendLabel="Send code to confirm"
                    verifyLabel="Confirm and continue here"
                    onToken={async (accessToken) => {
                      const device = await deviceCredentials();
                      await withProof(await api<AccountSession>('/auth/widget', { accessToken, ...device }));
                    }}
                  />
                ) : (
                  <>
                    <p>To make sure it is you, we will send a code to {phone || 'your phone'}.</p>
                    <button type="button" className="handover-button" onClick={() => void attempt(sendCode)}>
                      Send code
                    </button>
                  </>
                )}
              </>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void attempt(checkCode);
                }}
              >
                <label>
                  Code sent to {phone}
                  <input
                    required
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                  />
                </label>
                <button className="handover-button" disabled={!online || code.length !== 6}>
                  Confirm and continue here
                </button>
              </form>
            )}
            {message && (
              <p className="error" role="alert">
                {message}
              </p>
            )}
            {step !== 'working' && (
              <button type="button" className="secondary" onClick={close}>
                Cancel
              </button>
            )}
          </div>
        </Sheet>
      )}
    </>
  );
}

/** Shown on the old phone once another phone has taken the match over. */
export function MatchMovedAway({
  match,
  events,
  online,
  onBack,
  onOpen,
}: {
  match: LocalMatch;
  events: MatchEvent[];
  online: boolean;
  onBack: () => void;
  onOpen: (matchId: string) => void;
}) {
  const unsent = events.filter((event) => event.syncStatus !== 'SYNCED');
  return (
    <section className="match-moved" aria-label="Match moved to another phone">
      <p className="eyebrow">{match.name}</p>
      <h2>This match moved to another phone</h2>
      <p>
        It is now being scored on another phone signed in to your account. This phone can no longer change the
        score.
      </p>
      {unsent.length ? (
        <div className="handover-warning">
          <p>
            <strong>{`${plural(unsent.length, 'tap')} from this phone ${unsent.length === 1 ? 'was' : 'were'} not added`}</strong>
            {` because ${unsent.length === 1 ? 'it was' : 'they were'} never uploaded. Tell the new scorer if any should be entered again:`}
          </p>
          <UnsentTapList taps={unsent} />
        </div>
      ) : (
        <p className="handover-ok">Every tap from this phone was uploaded before the move. Nothing was lost.</p>
      )}
      <div className="match-moved-actions">
        <a className="watch-match" href={`/watch/${match.id}`}>
          Watch live
        </a>
        <button type="button" className="secondary" onClick={onBack}>
          Back to matches
        </button>
      </div>
      {match.state.status !== 'COMPLETED' && (
        <ContinueScoringHere
          matchId={match.id}
          title={match.name}
          online={online}
          label="Take scoring back to this phone"
          onDone={onOpen}
        />
      )}
    </section>
  );
}
