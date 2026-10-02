import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './app/styles.css';
import { PublicScorecard } from './features/scorecard/PublicScorecard';
import { LiveMatchViewer } from './features/scorecard/LiveMatchViewer';
import { HelpPage, PrivacyPage } from './features/legal/InfoPages';
const shareId = window.location.pathname.match(/^\/scorecard\/([0-9a-f-]{36})\/?$/i)?.[1];
const page = window.location.pathname.replace(/\/+$/, '');
const watchId = window.location.pathname.match(/^\/watch\/([0-9a-f-]{36})\/?$/i)?.[1];

createRoot(document.getElementById('root')!).render(
  <StrictMode>{page === '/privacy' ? <PrivacyPage /> : page === '/help' ? <HelpPage /> : watchId ? <LiveMatchViewer matchId={watchId} /> : shareId ? <PublicScorecard shareId={shareId} /> : <App />}</StrictMode>,
);
