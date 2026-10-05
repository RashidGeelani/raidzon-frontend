import { useState } from 'react';
import { api, deviceCredentials, type AccountSession } from '../data/auth-client';
import { WidgetPhoneSignIn } from './WidgetPhoneSignIn';

export function EditPlayerProfile({
  account,
  phone,
  name,
  online,
  onSaved,
}: {
  account: AccountSession;
  phone: string;
  name: string;
  online: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  /** With MSG91, the phone is re-verified in our own form (see WidgetPhoneSignIn). */
  const [widget, setWidget] = useState(false);
  function draftProblem() {
    if (!draft.trim() || draft.trim().length > 80)
      return 'Enter a name between 1 and 80 characters.';
    return '';
  }
  /** Saves the name with a fresh proof that this phone was just verified, then signs the proof out. */
  async function saveWith(proof: AccountSession) {
    try {
      if (proof.accountId !== account.accountId || proof.deviceId !== account.deviceId)
        throw new Error('Verify the same phone number as your signed-in account.');
      await api(
        '/account/player-profile',
        { name: draft.trim(), verificationToken: proof.token },
        account.token,
      );
      setEditing(false);
      setMessage(
        'Name updated. It now shows on your teams, tournaments, leaderboards and live matches.',
      );
      onSaved();
    } finally {
      await api('/auth/logout', {}, proof.token).catch(() => undefined);
    }
  }
  async function save() {
    const problem = draftProblem();
    if (problem) {
      setMessage(problem);
      return;
    }
    // Nothing to save: don't ask for verification or use up the name-change allowance.
    if (draft.trim() === name.trim()) {
      setEditing(false);
      setMessage('That is already your player name.');
      return;
    }
    setBusy(true);
    setMessage('');
    let proof: AccountSession | undefined;
    try {
      const device = await deviceCredentials();
      const capabilities = await api<{ widgetAvailable: boolean; smsAvailable: boolean }>(
        '/auth/capabilities',
      );
      if (capabilities.widgetAvailable) {
        setWidget(true);
        return;
      } else if (capabilities.smsAvailable && !challenge) {
        const result = await api<{ challengeId: string }>('/auth/challenges', { phone, ...device });
        setChallenge(result.challengeId);
        setMessage('Enter the code sent to your verified phone.');
        return;
      } else if (capabilities.smsAvailable) {
        proof = await api<AccountSession>('/auth/verify', {
          challengeId: challenge,
          code,
          ...device,
        });
      } else throw new Error('Phone verification is unavailable. Your profile has not changed.');
      if (proof.accountId !== account.accountId || proof.deviceId !== account.deviceId)
        throw new Error('Verify the same phone number as your signed-in account.');
      await api(
        '/account/player-profile',
        { name: draft.trim(), verificationToken: proof.token },
        account.token,
      );
      setEditing(false);
      setChallenge(null);
      setCode('');
      setMessage(
        'Name updated. It now shows on your teams, tournaments, leaderboards and live matches.',
      );
      onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save your profile.');
    } finally {
      if (proof) {
        setChallenge(null);
        setCode('');
        await api('/auth/logout', {}, proof.token).catch(() => undefined);
      }
      setBusy(false);
    }
  }
  return (
    <div>
      {!editing ? (
        <button
          className="secondary"
          disabled={!online}
          onClick={() => {
            setDraft(name);
            setMessage('');
            setEditing(true);
            setWidget(false);
            void api<{ widgetAvailable?: boolean }>('/auth/capabilities')
              .then((capabilities) => setWidget(capabilities.widgetAvailable === true))
              .catch(() => undefined);
          }}
        >
          Edit player name
        </button>
      ) : (
        <div className="edit-player-profile">
          <p>
            Verify {phone} again to save. Your name shows everywhere you play, including past
            matches. You can change it once every 30 days.
          </p>
          <label>
            Player display name
            <input
              required
              maxLength={80}
              value={draft}
              disabled={busy}
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          {widget ? (
            <WidgetPhoneSignIn
              online={online}
              fixedPhone={phone}
              sendLabel="Send code to verify"
              verifyLabel="Verify and save"
              onToken={async (accessToken) => {
                const problem = draftProblem();
                if (problem) throw new Error(problem);
                if (draft.trim() === name.trim())
                  throw new Error('That is already your player name.');
                const device = await deviceCredentials();
                await saveWith(
                  await api<AccountSession>('/auth/widget', { accessToken, ...device }),
                );
              }}
            />
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              {challenge && (
                <label>
                  Profile verification code
                  <input
                    required
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                  />
                </label>
              )}
              <button disabled={busy || !online}>
                {busy ? 'Verifying…' : 'Verify phone and save'}
              </button>
            </form>
          )}
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => {
              setEditing(false);
              setChallenge(null);
              setCode('');
            }}
          >
            Cancel
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
