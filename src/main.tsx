import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import './app/styles.css';
import './app/tokens.css';
import './app/display-settings';
import './app/install';
import { InAppBrowserBanner, InstallNudge } from './app/InstallPrompt';
import { watchForNewVersion } from './app/update-on-launch';
import { setPageMeta } from './app/page-meta';
const shareId = window.location.pathname.match(/^\/scorecard\/([0-9a-f-]{36})\/?$/i)?.[1];
const page = window.location.pathname.replace(/\/+$/, '');
const watchId = window.location.pathname.match(/^\/watch\/([0-9a-f-]{36})\/?$/i)?.[1];
const tournamentId = window.location.pathname.match(/^\/tournaments\/([0-9a-f-]{36})\/?$/i)?.[1];
const playerId = window.location.pathname.match(/^\/players\/([0-9a-f-]{36})\/?$/i)?.[1];

watchForNewVersion(page === '/privacy' || page === '/help' || !!watchId || !!shareId || !!tournamentId || !!playerId);
if (page === '/help') setPageMeta('Help & FAQ · RaidzOn kabaddi scoring app', 'How to score kabaddi matches, share live scores and run tournaments with RaidzOn. Answers to common questions and how to contact support.');
if (page === '/privacy') setPageMeta('Privacy policy · RaidzOn', 'What data RaidzOn collects to score kabaddi matches, run tournaments and keep player stats, and how it is used.');

// Each page downloads only its own code: a shared /watch link doesn't load the scoring app. The page is
// rendered once its code has arrived, so the server-filled summary in #root stays visible until then.
const content: Promise<ReactNode> =
  page === '/privacy' || page === '/help'
    ? import('./features/legal/InfoPages').then(({ HelpPage, PrivacyPage }) => (page === '/help' ? <HelpPage /> : <PrivacyPage />))
    : watchId
      ? import('./features/scorecard/LiveMatchViewer').then(({ LiveMatchViewer }) => <LiveMatchViewer matchId={watchId} />)
      : shareId
        ? import('./features/scorecard/PublicScorecard').then(({ PublicScorecard }) => <PublicScorecard shareId={shareId} />)
        : tournamentId
          ? import('./features/public/PublicTournamentPage').then(({ PublicTournamentPage }) => <PublicTournamentPage tournamentId={tournamentId} />)
          : playerId
            ? import('./features/public/PublicPlayerPage').then(({ PublicPlayerPage }) => <PublicPlayerPage playerId={playerId} />)
            : import('./app/App').then(({ App }) => <App />);

void content.then((node) =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <InAppBrowserBanner />
      {node}
      <InstallNudge />
      <Analytics />
      <SpeedInsights />
    </StrictMode>,
  ),
);
