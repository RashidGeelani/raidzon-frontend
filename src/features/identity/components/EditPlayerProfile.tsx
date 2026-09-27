import { useState } from 'react';
import { api, deviceCredentials, type AccountSession } from '../data/auth-client';
import { verifyWithWidget } from '../data/widget-client';

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
  async function save() {
    if (!draft.trim() || draft.trim().length > 80) {
      setMessage('Enter a name between 1 and 80 characters.');
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
        const accessToken = await verifyWithWidget();
        proof = await api<AccountSession>('/auth/widget', { accessToken, ...device });
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
      setMessage('Player name updated. Recorded match rosters are unchanged.');
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
          }}
        >
          Edit player name
        </button>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <p>
            Verify {phone} again to save. This changes your profile name, not past match rosters.
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
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
