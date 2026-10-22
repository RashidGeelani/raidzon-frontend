import { useState } from 'react';
import { Sheet } from '../../ui/Sheet';
import { DELAY_CHOICES, overlayLink } from './overlay-model';

/**
 * "Stream overlay": the link a streamer adds to OBS (Browser Source) or a phone streaming app with
 * web overlays (e.g. Prism Live Studio), with a delay to match how far the stream runs behind.
 * Opened from the public match page and from the scorer's "Share live link" popup.
 */
export function OverlayLinkSheet({ matchId, onClose }: { matchId: string; onClose: () => void }) {
  const [delay, setDelay] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const link = overlayLink(window.location.origin, matchId, delay);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const input = document.getElementById('overlay-link') as HTMLInputElement | null;
      input?.select();
      document.execCommand?.('copy');
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <Sheet eyebrow="LIVE STREAM" title="Score overlay for your stream" onClose={onClose}>
      <p className="overlay-sheet-intro">
        Show this match’s live score on your YouTube or Facebook stream, like on TV. The overlay has a
        see-through background and updates by itself.
      </p>
      <label className="overlay-sheet-delay">
        <span>Stream delay</span>
        <select value={delay} onChange={(event) => setDelay(Number(event.target.value))}>
          {DELAY_CHOICES.map((seconds) => (
            <option key={seconds} value={seconds}>
              {seconds === 0 ? 'No delay' : `${seconds} seconds`}
            </option>
          ))}
        </select>
      </label>
      <p className="field-note">
        Streams run a few seconds behind the court. If the score changes before viewers see the raid,
        pick a delay (10 seconds suits most YouTube streams) and copy the link again.
      </p>
      <input id="overlay-link" aria-label="Overlay link" readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
      <div className="share-popup-actions">
        <button className="primary" onClick={() => void copy()}>{copied ? 'Copied ✓' : 'Copy overlay link'}</button>
        <button className="secondary" onClick={() => window.open(link, '_blank', 'noopener')}>Preview</button>
      </div>
      <details className="overlay-sheet-steps">
        <summary>How to add it</summary>
        <p><strong>OBS Studio (laptop):</strong> Sources → + → Browser. Paste the link, set width 1920 and height 1080, and tick “Refresh browser when scene becomes active”.</p>
        <p><strong>Phone:</strong> use a streaming app that supports web overlays, such as Prism Live Studio: add a Web widget and paste the link.</p>
      </details>
    </Sheet>
  );
}
