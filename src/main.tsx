import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { App } from './app/App';
import './app/styles.css';
import './app/tokens.css';
import './app/display-settings';
import './app/install';
import { InAppBrowserBanner, InstallNudge } from './app/InstallPrompt';
import { watchForNewVersion } from './app/update-on-launch';
import { PublicScorecard } from './features/scorecard/PublicScorecard';
import { LiveMatchViewer } from './features/scorecard/LiveMatchViewer';
import { HelpPage, PrivacyPage } from './features/legal/InfoPages';
import { setPageMeta } from './app/page-meta';
import { PublicTournamentPage } from './features/public/PublicTournamentPage';
import { PublicPlayerPage } from './features/public/PublicPlayerPage';
const shareId = window.location.pathname.match(/^\/scorecard\/([0-9a-f-]{36})\/?$/i)?.[1];
const page = window.location.pathname.replace(/\/+$/, '');
const watchId = window.location.pathname.match(/^\/watch\/([0-9a-f-]{36})\/?$/i)?.[1];
const tournamentId = window.location.pathname.match(/^\/tournaments\/([0-9a-f-]{36})\/?$/i)?.[1];
const playerId = window.location.pathname.match(/^\/players\/([0-9a-f-]{36})\/?$/i)?.[1];

watchForNewVersion(page === '/privacy' || page === '/help' || !!watchId || !!shareId || !!tournamentId || !!playerId);
if (page === '/help') setPageMeta('Help & FAQ · RaidzOn kabaddi scoring app', 'How to score kabaddi matches, share live scores and run tournaments with RaidzOn. Answers to common questions and how to contact support.');
if (page === '/privacy') setPageMeta('Privacy policy · RaidzOn', 'What data RaidzOn collects to score kabaddi matches, run tournaments and keep player stats, and how it is used.');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <InAppBrowserBanner />
    {page === '/privacy' ? (
      <PrivacyPage />
    ) : page === '/help' ? (
      <HelpPage />
    ) : watchId ? (
      <LiveMatchViewer matchId={watchId} />
    ) : shareId ? (
      <PublicScorecard shareId={shareId} />
    ) : tournamentId ? (
      <PublicTournamentPage tournamentId={tournamentId} />
    ) : playerId ? (
      <PublicPlayerPage playerId={playerId} />
    ) : (
      <App />
    )}
    <InstallNudge />
    <Analytics />
    <SpeedInsights />
  </StrictMode>,
);
