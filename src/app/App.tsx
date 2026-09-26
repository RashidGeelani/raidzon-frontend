import { useEffect, useRef, useState } from 'react';
import { liveQuery } from 'dexie';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { db, recordEvent, sessionId } from '../features/matches/data/match-repository';
import { MatchSetup } from '../features/matches/components/MatchSetup';
import { LiveMatch } from '../features/scoring/components/LiveMatch';
import { AccountSync } from '../features/identity/components/AccountSync';
import type { LocalMatch, MatchEvent, MatchIntent } from '../features/scoring/domain/match-types';

export function App() {
  const [matches, setMatches] = useState<LocalMatch[]>([]);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [session, setSession] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [setup, setSetup] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  useEffect(() => {
    sessionId()
      .then(setSession)
      .catch((cause) => setError(`Local storage is unavailable: ${cause.message}`));
    const subscription = liveQuery(() =>
      db.matches.orderBy('updatedAt').reverse().toArray(),
    ).subscribe({
      next: (value) => {
        setMatches(value);
        setLoaded(true);
      },
      error: (cause) => setError(`Unable to load saved matches: ${cause}`),
    });
    const network = () => setOnline(navigator.onLine);
    window.addEventListener('online', network);
    window.addEventListener('offline', network);
    return () => {
      subscription.unsubscribe();
      window.removeEventListener('online', network);
      window.removeEventListener('offline', network);
    };
  }, []);
  useEffect(() => {
    setEvents([]);
    if (!selectedId) return;
    const subscription = liveQuery(() =>
      db.events.where('matchId').equals(selectedId).sortBy('sequence'),
    ).subscribe({
      next: setEvents,
      error: (cause) => setError(`Unable to load history: ${cause}`),
    });
    return () => subscription.unsubscribe();
  }, [selectedId]);
  const match = matches.find((item) => item.id === selectedId);
  const liveCount = matches.filter((m) => m.state.status !== 'COMPLETED').length;
  async function record(intent: MatchIntent) {
    if (!match || busy.current) return;
    busy.current = true;
    setSaving(true);
    setError('');
    try {
      await recordEvent(match.id, match.version, session, intent);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  function home() {
    setSetup(false);
    setSelectedId(null);
    setError('');
  }
  function startSetup() {
    setSelectedId(null);
    setSetup(true);
    setError('');
    navigator.storage?.persist?.().catch(() => undefined);
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            home();
          }}
        >
          <img src="/brand/raidzon-logo.png" alt="raidzOn — Every raid, every point" />
        </a>
        <p className="sidebar-caption">THE GAME. IN YOUR HANDS.</p>
        <nav>
          <button className={!setup ? 'nav-active' : ''} onClick={home}>
            <span>▦</span> Matches <small>{matches.length}</small>
          </button>
          <button className={setup ? 'nav-active' : ''} disabled={!session} onClick={startSetup}>
            <span>＋</span> New match
          </button>
        </nav>
        <div className="sidebar-bottom">
          <span className="guest-avatar">G</span>
          <div>
            <strong>Courtside scorer</strong>
            <small>On this device</small>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>YOUR COURTSIDE COMPANION</span>
          <div>
            <span className="network">
              <i className={`dot ${online ? 'live' : ''}`} />
              {online ? 'Online' : 'Offline'}
            </span>
            <span className="tag">
              {offlineReady || navigator.serviceWorker?.controller
                ? 'Ready offline'
                : 'Local-first scoring'}
            </span>
          </div>
        </header>
        <main>
          <AccountSync online={online} matches={matches} />
          {error && (
            <div className="error" role="alert">
              {error}
              <button className="quiet" onClick={() => setError('')}>
                Dismiss
              </button>
            </div>
          )}
          {setup ? (
            <MatchSetup
              session={session}
              onCancel={home}
              onCreated={(created) => {
                setSetup(false);
                setSelectedId(created.id);
              }}
            />
          ) : match ? (
            <LiveMatch
              match={match}
              events={events}
              onRecord={record}
              onBack={home}
              saving={saving}
            />
          ) : (
            <>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">WELCOME TO THE COURT</p>
                  <h1>Ready for the next raid?</h1>
                  <p>Keep your focus on the game. We’ll keep the score.</p>
                </div>
                <span className="date-label">
                  {new Intl.DateTimeFormat('en', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  }).format(new Date())}
                </span>
              </div>
              <section className="hero">
                <div className="hero-copy">
                  <span className="hero-tag">BUILT FOR THE SIDELINES</span>
                  <h2>
                    Big moments.
                    <br />
                    Every point recorded.
                  </h2>
                  <p>
                    From the opening raid to the final whistle.
                    <br />
                    Start a match, even without a connection.
                  </p>
                  <button className="lime" disabled={!session} onClick={startSetup}>
                    ＋ Start a match <span>↗</span>
                  </button>
                  <small>No sign-in. No interruption.</small>
                </div>
                <div className="court-art" aria-hidden="true">
                  <div className="court-lines">
                    <div className="court-half" />
                    <div className="court-half" />
                    <i className="court-player p1" />
                    <i className="court-player p2" />
                    <i className="court-player p3" />
                    <i className="court-player p4" />
                    <i className="court-player p5" />
                    <i className="court-player p6" />
                    <i className="court-player p7" />
                    <div className="raid-trail" />
                  </div>
                  <span>OWN THE COURT.</span>
                </div>
              </section>
              <div className="home-stats">
                <div>
                  <span className="stat-icon">↗</span>
                  <p>
                    <strong>{liveCount}</strong>
                    <small>Matches in progress</small>
                  </p>
                </div>
                <div>
                  <span className="stat-icon">✓</span>
                  <p>
                    <strong>{matches.length - liveCount}</strong>
                    <small>Completed matches</small>
                  </p>
                </div>
                <div>
                  <span className="stat-icon">◉</span>
                  <p>
                    <strong>On your device</strong>
                    <small>Every event saved locally</small>
                  </p>
                </div>
              </div>
              <section className="matches-section">
                <div className="panel-title">
                  <h2>
                    Your matches <span className="count">{matches.length}</span>
                  </h2>
                  <span className="muted">Most recently played</span>
                </div>
                {!loaded ? (
                  <p>Loading your saved matches…</p>
                ) : matches.length === 0 ? (
                  <div className="empty-state">
                    <span className="empty-icon">＋</span>
                    <h3>Your court is waiting.</h3>
                    <p>Add your teams and seven starters to get the first match underway.</p>
                    <button className="secondary" disabled={!session} onClick={startSetup}>
                      Create your first match →
                    </button>
                  </div>
                ) : (
                  <div className="match-cards">
                    {matches.map((item) => (
                      <button
                        className="match-card"
                        key={item.id}
                        onClick={() => {
                          setSelectedId(item.id);
                          setError('');
                        }}
                      >
                        <div>
                          <span className="tag">{item.state.status.replaceAll('_', ' ')}</span>
                          <small>
                            {item.serverAccountId &&
                            item.serverVersion === item.version &&
                            !item.syncError
                              ? 'Synced to account'
                              : 'Saved on device'}
                          </small>
                        </div>
                        <h3>
                          {item.state.teams[0].name}
                          <strong>{item.state.scores[0]}</strong>
                        </h3>
                        <h3>
                          {item.state.teams[1].name}
                          <strong>{item.state.scores[1]}</strong>
                        </h3>
                        <p>
                          {item.state.status === 'COMPLETED' ? 'View result' : 'Resume match'}{' '}
                          <span>→</span>
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </section>
              <div className="local-note">
                <span>◈</span>
                <p>
                  <strong>Built to keep going.</strong> Matches stay on this browser. Sign in and
                  sync to save a copy to your account when connected.
                </p>
              </div>
            </>
          )}
        </main>
        <footer>
          <span>
            raidzOn <b>·</b> Every raid has a story.
          </span>
          <span>LOCAL DEVELOPMENT · v0.1</span>
        </footer>
        {needRefresh && (
          <div className="update-banner">
            An app update is ready. Finish scoring before updating.
            <button
              disabled={(!!match && match.state.status !== 'COMPLETED') || setup}
              onClick={() => updateServiceWorker(true)}
            >
              Update app
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
