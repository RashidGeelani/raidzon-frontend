import { useState } from 'react';
import { Sheet } from '../ui/Sheet';
import {
  canOfferInstall,
  chromeIntentUrl,
  closeNudge,
  promptInstall,
  snoozeInstall,
  useInstallState,
  type InstallPlatform,
  type NudgeReason,
} from './install';

const NUDGE_COPY: Record<NudgeReason, { title: string; body: string }> = {
  scored: {
    title: 'Score your next match in one tap',
    body: 'Add raidzOn to your home screen. It opens instantly and works offline courtside.',
  },
  followed: {
    title: 'Live scores on your home screen',
    body: 'Open the tournaments you follow straight from your home screen.',
  },
  watching: {
    title: 'Watching live?',
    body: 'Install raidzOn for quicker live scores next time.',
  },
};

function ShareIcon() {
  return (
    <svg className="install-share-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3v12M7.5 7.5 12 3l4.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 11H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Step-by-step help for browsers without an install dialog (iPhone Safari, in-app browsers). */
export function InstallGuide({
  platform,
  onClose,
}: {
  platform: InstallPlatform;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  if (platform === 'in-app-ios' || platform === 'in-app-android') {
    return (
      <Sheet title="Open raidzOn in your browser" eyebrow="INSTALL" onClose={onClose}>
        <p className="install-guide-intro">
          This screen is inside{' '}
          {platform === 'in-app-ios' ? 'another app' : 'WhatsApp or another app'}, which can’t add
          raidzOn to your home screen.
        </p>
        <ol className="install-steps">
          {platform === 'in-app-android' ? (
            <li>
              <span>1</span>Tap <strong>Open in Chrome</strong> below, then choose{' '}
              <strong>Install</strong>.
            </li>
          ) : (
            <>
              <li>
                <span>1</span>Tap <strong>⋯</strong> or the compass icon and choose{' '}
                <strong>Open in Safari</strong>.
              </li>
              <li>
                <span>2</span>In Safari, tap <ShareIcon /> <strong>Share</strong>, then{' '}
                <strong>Add to Home Screen</strong>.
              </li>
            </>
          )}
        </ol>
        <div className="install-actions">
          {platform === 'in-app-android' && (
            <a className="primary" href={chromeIntentUrl(window.location.href)}>
              Open in Chrome
            </a>
          )}
          <button type="button" className="secondary" onClick={copyLink}>
            {copied ? 'Link copied ✓' : 'Copy link'}
          </button>
        </div>
      </Sheet>
    );
  }
  return (
    <Sheet title="Add raidzOn to your Home Screen" eyebrow="INSTALL" onClose={onClose}>
      <ol className="install-steps">
        <li>
          <span>1</span>Tap <ShareIcon /> <strong>Share</strong> in Safari’s toolbar.
        </li>
        <li>
          <span>2</span>Scroll down and tap <strong>Add to Home Screen</strong>.
        </li>
        <li>
          <span>3</span>Tap <strong>Add</strong>. raidzOn opens full screen from your home screen.
        </li>
      </ol>
      <div className="install-actions">
        <button type="button" className="primary" onClick={onClose}>
          Got it
        </button>
      </div>
    </Sheet>
  );
}

/** Runs the right install action for this browser; opens the guide where there is no dialog. */
function useInstallAction() {
  const install = useInstallState();
  const [guide, setGuide] = useState(false);
  async function start() {
    if (install.platform === 'native') await promptInstall();
    else setGuide(true);
  }
  const label =
    install.platform === 'native'
      ? 'Install'
      : install.platform === 'in-app-android'
        ? 'Open in Chrome'
        : 'Show me how';
  const guideElement = guide ? (
    <InstallGuide platform={install.platform} onClose={() => setGuide(false)} />
  ) : null;
  return { install, start, label, guideElement };
}

/** Floating nudge shown after a meaningful moment. Rendered once at the root of every page. */
export function InstallNudge() {
  const { install, start, label, guideElement } = useInstallAction();
  if (!install.nudge && !guideElement) return null;
  const copy = install.nudge ? NUDGE_COPY[install.nudge] : null;
  return (
    <>
      {copy && (
        <aside className="install-nudge" role="dialog" aria-label="Install raidzOn">
          <img src="/brand/raidzon-logo-192.png" alt="" width="44" height="44" />
          <div>
            <strong>{copy.title}</strong>
            <p>{copy.body}</p>
            <div className="install-nudge-actions">
              <button
                type="button"
                className="primary"
                onClick={() => {
                  closeNudge();
                  void start();
                }}
              >
                {label}
              </button>
              <button type="button" className="quiet" onClick={() => snoozeInstall()}>
                Not now
              </button>
            </div>
          </div>
        </aside>
      )}
      {guideElement}
    </>
  );
}

/** Permanent entry on the Profile tab; hidden when installed or when this browser can't install. */
export function InstallCard() {
  const { install, start, label, guideElement } = useInstallAction();
  if (install.installed) {
    return (
      <section className="panel install-card install-card-done" aria-label="App installed">
        <p>✓ raidzOn is on your home screen.</p>
      </section>
    );
  }
  if (!canOfferInstall(install)) return null;
  return (
    <section className="panel install-card" aria-label="Install raidzOn">
      <img src="/brand/raidzon-logo-192.png" alt="" width="48" height="48" />
      <div>
        <h3>Get the raidzOn app</h3>
        <p>Opens from your home screen, full screen and offline. No app store needed.</p>
      </div>
      <button type="button" className="primary" onClick={() => void start()}>
        {label}
      </button>
      {guideElement}
    </section>
  );
}

/** Slim strip inside WhatsApp/Instagram browsers, which can't install or keep scores offline. */
export function InAppBrowserBanner() {
  const install = useInstallState();
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem('raidzon.inapp.hidden') === '1';
    } catch {
      return false;
    }
  });
  const [guide, setGuide] = useState(false);
  if (hidden || (install.platform !== 'in-app-android' && install.platform !== 'in-app-ios'))
    return null;
  function hide() {
    setHidden(true);
    try {
      sessionStorage.setItem('raidzon.inapp.hidden', '1');
    } catch {
      /* private mode */
    }
  }
  return (
    <div className="inapp-banner" role="note">
      <span>
        Open in {install.platform === 'in-app-ios' ? 'Safari' : 'Chrome'} for the full app
      </span>
      {install.platform === 'in-app-android' ? (
        <a href={chromeIntentUrl(window.location.href)}>Open</a>
      ) : (
        <button type="button" onClick={() => setGuide(true)}>
          How?
        </button>
      )}
      <button type="button" className="inapp-close" aria-label="Dismiss" onClick={hide}>
        ×
      </button>
      {guide && <InstallGuide platform={install.platform} onClose={() => setGuide(false)} />}
    </div>
  );
}
