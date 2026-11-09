import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '../../ui/Sheet';
import { Tabs } from '../../ui/Tabs';
import { api } from '../identity/data/api';
import { useTournamentBrand } from '../tournaments/sponsors';
import {
  cardPoster, fixturesPoster, livePoster, playerPoster, posterCaption, posterFileName, resultPoster, shortLinkTarget, tablePoster,
  type Poster, type PosterCareer, type PosterMatch, type PosterMeta, type PosterTournament,
} from './poster-model';
import { renderPoster, type PosterSize } from './render-poster';

/** One poster the sheet offers, with its tab label. */
interface PosterChoice { label: string; poster: Poster }

/**
 * "Share a poster" for a finished match: result or player of the match. link is the public match
 * page (also in the poster's QR code).
 */
export function PosterShareButton({ match, meta, link }: { match: PosterMatch; meta: PosterMeta; link: string }) {
  // The live viewer re-renders several times a second; only rebuild when the poster's data changes.
  const { tournamentName, date, venue, sponsors } = meta;
  const choices = useMemo(() => {
    const player = playerPoster(match, { tournamentName, date, venue, sponsors });
    return [
      { label: 'Result', poster: resultPoster(match, { tournamentName, date, venue, sponsors }) },
      ...(player ? [{ label: 'Player of the match', poster: player }] : []),
    ];
  }, [match, tournamentName, date, venue, sponsors]);
  return <PosterButton eyebrow="FULL TIME" choices={choices} link={link} />;
}

/** "Live now" poster for a match that has started: teams, LIVE badge and a large QR code to watch. */
export function LivePosterButton({ teams, meta, link }: { teams: readonly string[]; meta: PosterMeta; link: string }) {
  const [teamA, teamB] = teams;
  const { tournamentName, date, venue, sponsors } = meta;
  const choices = useMemo(() => [{ label: 'Live now', poster: livePoster([teamA, teamB], { tournamentName, date, venue, sponsors }) }], [teamA, teamB, tournamentName, date, venue, sponsors]);
  return <PosterButton eyebrow="MATCH STARTED" label="Share a Live now poster" choices={choices} link={link} />;
}

/** Next matches or the points table of a tournament; hidden when there is nothing to show. link is the tournament page. */
export function TournamentPosterButton({ detail, kind, link }: { detail: PosterTournament; kind: 'fixtures' | 'table'; link: string }) {
  // The organiser's dashboard view has no sponsors; fetch them from the public view then.
  const fetched = useTournamentBrand(detail.sponsors ? null : shortLinkTarget(link)?.id);
  const sponsors = detail.sponsors ?? fetched.sponsors;
  const poster = useMemo(() => {
    const withSponsors = { ...detail, sponsors };
    return kind === 'fixtures' ? fixturesPoster(withSponsors) : tablePoster(withSponsors);
  }, [detail, kind, sponsors]);
  const choices = useMemo(() => (poster ? [{ label: kind === 'fixtures' ? 'Next matches' : 'Points table', poster }] : []), [poster, kind]);
  if (!poster) return null;
  return <PosterButton eyebrow={kind === 'fixtures' ? 'FIXTURES' : 'POINTS TABLE'} label={kind === 'fixtures' ? 'Share fixtures poster' : 'Share points table poster'} choices={choices} link={link} />;
}

/** Verified player card from the public player page; hidden when no match counts yet. link is the player page. */
export function PlayerCardButton({ player, link }: { player: PosterCareer; link: string }) {
  const poster = useMemo(() => cardPoster(player), [player]);
  const choices = useMemo(() => (poster ? [{ label: 'Player card', poster }] : []), [poster]);
  if (!poster) return null;
  return <PosterButton eyebrow="PLAYER CARD" label="Share player card" choices={choices} link={link} />;
}

export const tournamentLink = (tournamentId: string) => `${window.location.origin}/tournaments/${tournamentId}`;

function PosterButton({ eyebrow, label = 'Share a poster', choices, link }: { eyebrow: string; label?: string; choices: PosterChoice[]; link: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="secondary poster-share-button" onClick={() => setOpen(true)}>{label}</button>
    {open && <PosterSheet eyebrow={eyebrow} choices={choices} link={link} onClose={() => setOpen(false)} />}
  </>;
}

/**
 * Picks the poster and its size (feed square or status / story), shows a preview, then shares it as
 * an image with a one-line caption and the link where the phone allows it, downloads it otherwise.
 */
function PosterSheet({ eyebrow, choices, link, onClose }: { eyebrow: string; choices: PosterChoice[]; link: string; onClose: () => void }) {
  const [choice, setChoice] = useState('0');
  const [size, setSize] = useState<PosterSize>('square');
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [note, setNote] = useState('');
  const [shortLink, setShortLink] = useState<string | null>(null);
  const picked = choices[Number(choice)] ?? choices[0];
  const poster = picked.poster;
  // The short link (raidzon.com/m/AB2CD) goes in the QR code, under it and in the caption; offline or on
  // any error the full link is used.
  const shareLink = shortLink ?? link;

  useEffect(() => {
    const target = shortLinkTarget(link);
    if (!target || !navigator.onLine) return;
    let active = true;
    api<{ code: string }>('/public/short-links', target, undefined, 8000)
      .then((result) => { if (active) setShortLink(`${window.location.origin}/m/${result.code}`); })
      .catch(() => { /* keep the full link */ });
    return () => { active = false; };
  }, [link]);

  useEffect(() => {
    let active = true;
    let url = '';
    setImage(null);
    setNote('');
    renderPoster(poster, size, shareLink)
      .then((blob) => {
        if (!active) return;
        url = URL.createObjectURL(blob);
        setImage({ blob, url });
      })
      .catch(() => { if (active) setNote('Could not create the poster on this device.'); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [poster, size, shareLink]);

  async function share() {
    if (!image) return;
    const file = new File([image.blob], posterFileName(poster), { type: 'image/png' });
    const caption = posterCaption(poster, shareLink);
    try {
      // The link goes inside text: some apps drop a separate url when a file is attached.
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: poster.kind === 'result' ? poster.headline : picked.label, text: caption });
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
    const copied = await navigator.clipboard?.writeText(shareLink).then(() => true, () => false);
    setNote(copied ? 'Link copied.' : `Copy this link: ${shareLink}`);
  }

  return (
    <Sheet eyebrow={eyebrow} title="Share a poster" onClose={onClose}>
      {choices.length > 1 && <Tabs label="Poster" value={choice} onChange={setChoice} items={choices.map((item, index) => ({ value: String(index), label: item.label }))} />}
      <Tabs label="Size" value={size} onChange={setSize} items={[{ value: 'square', label: 'Square post' }, { value: 'story', label: 'Status / story' }]} />
      {image ? <img className="poster-preview" src={image.url} alt={`${picked.label} poster preview`} /> : !note && <p role="status">Making the poster…</p>}
      {note && <p className="field-note" role="status">{note}</p>}
      {size === 'story' && <p className="field-note">Instagram story? Add a Link sticker with the link so people can tap through.</p>}
      <div className="share-popup-actions">
        <button type="button" className="primary" disabled={!image} onClick={() => void share()}>Share poster</button>
        <button type="button" className="secondary" onClick={() => void copyLink()}>Copy link</button>
        <button type="button" className="quiet" onClick={onClose}>Done</button>
      </div>
    </Sheet>
  );
}
