import { useEffect, useRef, useState } from 'react';
import { normalizePhone } from '../../matches/data/match-repository';
import {
  prepareWidget,
  releaseWidget,
  verifyWithWidget,
  widgetCaptchaReady,
  widgetResendCode,
  widgetSendCode,
  widgetVerifyCode,
} from '../data/widget-client';

let instances = 0;
const RESEND_SECONDS = 30;

/**
 * Phone + code form drawn by the app, with MSG91 sending and checking the code behind it
 * (its approved SMS template, so no DLT registration of our own is needed). Falls back to
 * MSG91's own popup if its custom mode can't start.
 *
 * fixedPhone: verify this number (E.164) without asking for it, e.g. before a profile change.
 * onToken: receives MSG91's access token; the caller exchanges it with our backend.
 */
export function WidgetPhoneSignIn({
  online,
  fixedPhone,
  sendLabel = 'Send code',
  verifyLabel = 'Sign in',
  onToken,
}: {
  online: boolean;
  fixedPhone?: string;
  sendLabel?: string;
  verifyLabel?: string;
  onToken: (accessToken: string) => Promise<void>;
}) {
  const captchaId = useRef(`raidzon-captcha-${++instances}`).current;
  const [mode, setMode] = useState<'loading' | 'custom' | 'popup'>('loading');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<{ to: string; reqId?: string; resendAt: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(Date.now());
  /** After a failed attempt we offer MSG91's own popup as a way out. */
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    if (!online) return;
    prepareWidget(captchaId)
      .then((ready) => active && setMode(ready ? 'custom' : 'popup'))
      .catch((error: Error) => {
        if (!active) return;
        setMode('popup');
        setMessage(error.message);
      });
    return () => {
      active = false;
      releaseWidget(captchaId);
    };
  }, [captchaId, online]);
  useEffect(() => {
    if (!sent) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [sent]);

  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    setNotice('');
    try {
      await work();
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof Error ? error.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  const send = () =>
    run(async () => {
      const to = fixedPhone ?? normalizePhone(phone);
      // MSG91 decides whether the "I am human" check passed; its own status can lag behind the
      // box (e.g. when a second form shows the check), so we only use it to explain a failure.
      let reqId: string | undefined;
      try {
        reqId = await widgetSendCode(to);
      } catch (error) {
        if (!widgetCaptchaReady()) throw new Error('Tick “I am human”, then tap send again.');
        throw error;
      }
      setSent({ to, reqId, resendAt: Date.now() + RESEND_SECONDS * 1000 });
      setNow(Date.now());
      setCode('');
    });
  const verify = () =>
    run(async () => {
      if (!/^[0-9]{4,8}$/.test(code)) throw new Error('Enter the code from the SMS.');
      const token = await widgetVerifyCode(code, sent?.reqId);
      await onToken(token);
    });
  const wait = sent ? Math.max(0, Math.ceil((sent.resendAt - now) / 1000)) : 0;

  if (mode === 'popup')
    return (
      <div className="widget-signin">
        {message && (
          <p className="error" role="alert">
            {message}
          </p>
        )}
        <button
          type="button"
          className="primary signin-card-submit"
          disabled={!online || busy}
          onClick={() => void run(async () => onToken(await verifyWithWidget()))}
        >
          {busy ? 'Complete phone verification…' : 'Verify with phone'}
        </button>
      </div>
    );
  return (
    <form
      className="widget-signin"
      onSubmit={(event) => {
        event.preventDefault();
        void (sent ? verify() : send());
      }}
    >
      {!fixedPhone && (
        <label>
          Mobile number
          <span className="signin-phone">
            <b aria-hidden="true">🇮🇳 +91</b>
            <input
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              value={phone}
              required
              disabled={!!sent || busy}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="98765 43210"
            />
          </span>
        </label>
      )}
      {sent && (
        <>
          <label>
            Verification code
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              value={code}
              required
              autoFocus
              aria-describedby={`${captchaId}-sent`}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            />
          </label>
          <small id={`${captchaId}-sent`} className="field-note">
            Sent to {sent.to}. It can take up to a minute to arrive.
          </small>
        </>
      )}
      {/* MSG91 draws its "I am human" check here; it is only needed before sending. */}
      <div id={captchaId} className="signin-captcha" hidden={!!sent} />
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      {notice && (
        <p className="field-note" role="status">
          {notice}
        </p>
      )}
      <div className="sync-controls">
        <button
          className="primary signin-card-submit"
          disabled={!online || busy || mode === 'loading'}
        >
          {busy ? 'Please wait…' : mode === 'loading' ? 'Loading…' : sent ? verifyLabel : sendLabel}
        </button>
        {sent && (
          <>
            <button
              type="button"
              className="secondary"
              disabled={busy || wait > 0}
              onClick={() =>
                void run(async () => {
                  await widgetResendCode(sent.reqId);
                  setSent({ ...sent, resendAt: Date.now() + RESEND_SECONDS * 1000 });
                  setNotice('A new code is on its way.');
                })
              }
            >
              {wait > 0 ? `Resend in ${wait}s` : 'Resend code'}
            </button>
            {!fixedPhone && (
              <button
                type="button"
                className="quiet"
                disabled={busy}
                onClick={() => {
                  setSent(null);
                  setCode('');
                  setMessage('');
                }}
              >
                Change number
              </button>
            )}
          </>
        )}
      </div>
      {failed && (
        <button
          type="button"
          className="quiet widget-signin-fallback"
          disabled={busy}
          onClick={() => void run(async () => onToken(await verifyWithWidget()))}
        >
          Having trouble? Verify in the MSG91 window instead
        </button>
      )}
    </form>
  );
}
