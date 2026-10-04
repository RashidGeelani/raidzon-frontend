import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './app/styles.css';
import './app/tokens.css';
import './app/display-settings';
import './app/install';
import { InAppBrowserBanner, InstallNudge } from './app/InstallPrompt';
import { PublicScorecard } from './features/scorecard/PublicScorecard';
import { LiveMatchViewer } from './features/scorecard/LiveMatchViewer';
import { HelpPage, PrivacyPage } from './features/legal/InfoPages';
const shareId = window.location.pathname.match(/^\/scorecard\/([0-9a-f-]{36})\/?$/i)?.[1];
const page = window.location.pathname.replace(/\/+$/, '');
const watchId = window.location.pathname.match(/^\/watch\/([0-9a-f-]{36})\/?$/i)?.[1];

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
    ) : (
      <App />
    )}
    <InstallNudge />
  </StrictMode>,
);
