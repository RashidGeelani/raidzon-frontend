import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '../../ui/Sheet';
import { Tabs } from '../../ui/Tabs';
import { playerPoster, posterCaption, posterFileName, resultPoster, type PosterMatch, type PosterMeta } from './poster-model';
import { renderPoster, type PosterSize } from './render-poster';

type Kind = 'result' | 'player';

/**
 * "Share a poster" for a finished match: result or player of the match, feed (square) or status /
 * story size, shared as an image with a one-line caption and the match link where the phone allows
 * it, downloaded otherwise. link is the public match page (also in the poster's QR code).
 */
export function PosterShareButton({ match, meta, link }: { match: PosterMatch; meta: PosterMeta; link: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="secondary poster-share-button" onClick={() => setOpen(true)}>Share a poster</button>
    {open && <PosterSheet match={match} meta={meta} link={link} onClose={() => setOpen(false)} />}
  </>;
}

function PosterSheet({ match, meta, link, onClose }: { match: PosterMatch; meta: PosterMeta; link: string; onClose: () => void }) {
  const [kind, setKind] = useState<Kind>('result');
  const [size, setSize] = useState<PosterSize>('square');
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [note, setNote] = useState('');
  // The live viewer re-renders several times a second; only redraw when the poster's data changes.
  const { tournamentName, date, venue } = meta;
  const result = useMemo(() => resultPoster(match, { tournamentName, date, venue }), [match, tournamentName, date, venue]);
  const player = useMemo(() => playerPoster(match, { tournamentName, date, venue }), [match, tournamentName, date, venue]);
  const poster = kind === 'player' && player ? player : result;

  useEffect(() => {
    let active = true;
    let url = '';
    setImage(null);
    setNote('');
    renderPoster(poster, size, link)
      .then((blob) => {
        if (!active) return;
        url = URL.createObjectURL(blob);
        setImage({ blob, url });
      })
      .catch(() => { if (active) setNote('Could not create the poster on this device.'); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [poster, size, link]);

  async function share() {
    if (!image) return;
    const file = new File([image.blob], posterFileName(poster), { type: 'image/png' });
    const caption = posterCaption(poster, link);
    try {
      // The link goes inside text: some apps drop a separate url when a file is attached.
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: kind === 'result' ? result.headline : 'Player of the match', text: caption });
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
    const anchor = document.createElement('a');
    anchor.href = image.url;
    anchor.download = file.name;
    anchor.click();
    const copied = await navigator.clipboard?.writeText(caption).then(() => true, () => false);
    setNote(copied ? 'Poster saved and caption with the link copied. Paste it when you post.' : 'Poster saved. Post it to WhatsApp, Instagram or Facebook.');
  }

  async function copyLink() {
    const copied = await navigator.clipboard?.writeText(link).then(() => true, () => false);
    setNote(copied ? 'Link copied.' : `Copy this link: ${link}`);
  }

  return (
    <Sheet eyebrow="FULL TIME" title="Share a poster" onClose={onClose}>
      <Tabs label="Poster" value={kind} onChange={setKind} items={[{ value: 'result', label: 'Result' }, ...(player ? [{ value: 'player' as const, label: 'Player of the match' }] : [])]} />
      <Tabs label="Size" value={size} onChange={setSize} items={[{ value: 'square', label: 'Square post' }, { value: 'story', label: 'Status / story' }]} />
      {image ? <img className="poster-preview" src={image.url} alt={`${kind === 'result' ? 'Result' : 'Player of the match'} poster preview`} /> : !note && <p role="status">Making the poster…</p>}
      {note && <p className="field-note" role="status">{note}</p>}
      {size === 'story' && <p className="field-note">Instagram story? Add a Link sticker with the scorecard link so people can tap through.</p>}
      <div className="share-popup-actions">
        <button type="button" className="primary" disabled={!image} onClick={() => void share()}>Share poster</button>
        <button type="button" className="secondary" onClick={() => void copyLink()}>Copy link</button>
        <button type="button" className="quiet" onClick={onClose}>Done</button>
      </div>
    </Sheet>
  );
}
