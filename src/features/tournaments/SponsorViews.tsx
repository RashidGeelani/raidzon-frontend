import { useEffect, useState } from 'react';
import { api, type AccountSession } from '../identity/data/auth-client';
import { MAX_SPONSORS, shrinkLogo, sponsorHref, sponsorLogoSrc, titleSponsor, type Sponsor } from './sponsors';

/** Sponsor logos in a row, Title sponsor first and larger; each opens its website or phone number when it has one. */
export function SponsorStrip({ sponsors }: { sponsors: readonly Sponsor[] }) {
  if (!sponsors.length) return null;
  return (
    <section className="sponsor-strip" aria-label="Sponsors">
      <small>{titleSponsor(sponsors) ? 'Sponsored by' : 'Partners'}</small>
      <ul>
        {sponsors.map((sponsor) => {
          const href = sponsorHref(sponsor.link);
          const logo = <img src={sponsorLogoSrc(sponsor)} alt={sponsor.name} loading="lazy" />;
          return <li key={sponsor.id} className={sponsor.level === 'TITLE' ? 'title' : ''}>
            {href ? <a href={href} target="_blank" rel="noopener sponsored">{logo}</a> : logo}
          </li>;
        })}
      </ul>
    </section>
  );
}

/** "presented by ABC Motors" under a tournament name, when it has a Title sponsor. */
export const PresentedBy = ({ sponsors }: { sponsors: readonly Sponsor[] }) => {
  const title = titleSponsor(sponsors);
  return title ? <p className="presented-by">presented by <strong>{title.name}</strong></p> : null;
};

interface Draft { id: string; name: string; level: Sponsor['level']; link: string; logo: string | null; preview: string | null }
const blank = (level: Sponsor['level']): Draft => ({ id: crypto.randomUUID(), name: '', level, link: '', logo: null, preview: null });

/**
 * Organiser's Sponsors tab: up to 4 sponsors, one of them the Title sponsor. Logos are shrunk on the
 * phone before upload. Shown on posters, the public tournament and match pages, and (Title only) the overlay.
 */
export function SponsorSettings({ tournamentId, account, online }: { tournamentId: string; account: AccountSession; online: boolean }) {
  const [sponsors, setSponsors] = useState<Sponsor[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!online) return;
    let active = true;
    api<Sponsor[]>(`/tournaments/${tournamentId}/sponsors`, undefined, account.token)
      .then((list) => { if (active) setSponsors(list); })
      .catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : 'Could not load sponsors.'); });
    return () => { active = false; };
  }, [tournamentId, account.token, online]);
  const hasTitle = !!titleSponsor(sponsors);

  async function pick(file: File | undefined) {
    if (!file || !draft) return;
    setMessage('');
    try {
      const logo = await shrinkLogo(file);
      setDraft({ ...draft, logo, preview: `data:image/png;base64,${logo}` });
    } catch (error) {
      setMessage(error instanceof Error && error.message ? error.message : 'Could not read this image. Choose a PNG, JPG or WebP logo.');
    }
  }
  async function send(path: string, body: object) {
    setBusy(true);
    setMessage('');
    try {
      setSponsors(await api<Sponsor[]>(path, body, account.token));
      setDraft(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save the sponsor.');
    } finally {
      setBusy(false);
    }
  }
  function save() {
    if (!draft) return;
    if (!draft.name.trim()) { setMessage('Enter the sponsor’s name.'); return; }
    const isNew = !sponsors?.some((sponsor) => sponsor.id === draft.id);
    if (isNew && !draft.logo) { setMessage('Add the sponsor’s logo.'); return; }
    void send(`/tournaments/${tournamentId}/sponsors`, { id: draft.id, name: draft.name, level: draft.level, link: draft.link, ...(draft.logo ? { logo: draft.logo } : {}) });
  }

  if (!online) return <p className="field-note">Connect to the internet to manage sponsors.</p>;
  if (!sponsors) return <p role="status">{message || 'Loading sponsors…'}</p>;
  return (
    <div className="sponsor-settings">
      <p className="field-note">Sponsor logos appear on every poster of this tournament, on its public page and match pages, and the Title sponsor on the stream overlay. Up to {MAX_SPONSORS} sponsors, one of them the Title sponsor.</p>
      <ul className="sponsor-list">
        {sponsors.map((sponsor) => <li key={sponsor.id}>
          <img src={sponsorLogoSrc(sponsor)} alt="" />
          <span><strong>{sponsor.name}</strong><small>{sponsor.level === 'TITLE' ? 'Title sponsor' : 'Partner'}{sponsor.link ? ` · ${sponsor.link}` : ''}</small></span>
          <button type="button" className="quiet" disabled={busy} onClick={() => setDraft({ id: sponsor.id, name: sponsor.name, level: sponsor.level, link: sponsor.link ?? '', logo: null, preview: sponsorLogoSrc(sponsor) })}>Edit</button>
          <button type="button" className="quiet" disabled={busy} onClick={() => void send(`/tournaments/${tournamentId}/sponsors/${sponsor.id}/remove`, {})}>Remove</button>
        </li>)}
      </ul>
      {!sponsors.length && !draft && <p className="list-empty">No sponsors yet.</p>}
      {draft ? (
        <form className="sponsor-form" onSubmit={(event) => { event.preventDefault(); save(); }}>
          <label>Sponsor name<input id="sponsor-name" maxLength={60} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="ABC Motors" /></label>
          <label>Level
            <select id="sponsor-level" value={draft.level} onChange={(event) => setDraft({ ...draft, level: event.target.value as Sponsor['level'] })}>
              <option value="TITLE" disabled={hasTitle && titleSponsor(sponsors)?.id !== draft.id}>Title sponsor</option>
              <option value="PARTNER">Partner</option>
            </select>
          </label>
          <label>Website or phone (optional)<input id="sponsor-link" maxLength={200} value={draft.link} onChange={(event) => setDraft({ ...draft, link: event.target.value })} placeholder="https://… or +91…" /></label>
          <label className="sponsor-logo-pick">Logo (PNG, JPG or WebP)
            <input id="sponsor-logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void pick(event.target.files?.[0])} />
          </label>
          {draft.preview && <img className="sponsor-logo-preview" src={draft.preview} alt="Logo preview" />}
          <div className="share-popup-actions">
            <button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save sponsor'}</button>
            <button type="button" className="quiet" disabled={busy} onClick={() => { setDraft(null); setMessage(''); }}>Cancel</button>
          </div>
        </form>
      ) : sponsors.length < MAX_SPONSORS && <button type="button" className="secondary" onClick={() => setDraft(blank(hasTitle ? 'PARTNER' : 'TITLE'))}>+ Add sponsor</button>}
      {message && <p className="field-note bad" role="status">{message}</p>}
    </div>
  );
}
