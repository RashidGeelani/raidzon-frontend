import { useEffect, useState } from 'react';
import { api, ApiError } from '../identity/data/api';

/** Where a resolved short link goes: the public match page or the tournament page. */
export const shortLinkPath = (link: { type: string; id: string }) => (link.type === 'MATCH' ? `/watch/${link.id}` : `/tournaments/${link.id}`);

/** /m/:code from a poster: looks the code up and replaces this page with the match or tournament. */
export function ShortLinkPage({ code }: { code: string }) {
  const [message, setMessage] = useState('Opening…');
  useEffect(() => {
    api<{ type: string; id: string }>(`/public/short-links/${encodeURIComponent(code)}`)
      .then((link) => window.location.replace(shortLinkPath(link)))
      .catch((error) => setMessage(error instanceof ApiError && error.status === 404
        ? 'This link doesn’t lead anywhere. Check the code on the poster.'
        : 'Could not open the link. Check your connection and try again.'));
  }, [code]);
  return (
    <main className="info-page">
      <header className="info-page-header"><a className="tournament-back" href="/" aria-label="Open raidzOn">←</a><span className="info-page-brand">raidzOn</span></header>
      <p role="status">{message}</p>
      {message !== 'Opening…' && <p><a href="/">Open RaidzOn</a></p>}
    </main>
  );
}
