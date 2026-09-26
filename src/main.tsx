import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './app/styles.css';
import { PublicScorecard } from './features/scorecard/PublicScorecard';
const shareId = window.location.pathname.match(/^\/scorecard\/([0-9a-f-]{36})\/?$/i)?.[1];

createRoot(document.getElementById('root')!).render(
  <StrictMode>{shareId ? <PublicScorecard shareId={shareId} /> : <App />}</StrictMode>,
);
