import { useEffect, useRef, useState } from 'react';
import { liveQuery } from 'dexie';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { db, recordEvent, sessionId } from '../features/matches/data/match-repository';
import { MatchSetup } from '../features/matches/components/MatchSetup';
import { LiveMatch } from '../features/scoring/components/LiveMatch';
import { LiveMatchViewer } from '../features/scorecard/LiveMatchViewer';
import { AccountSync } from '../features/identity/components/AccountSync';
import { SyncedLeaderboards } from '../features/scoring/components/SyncedLeaderboards';
import type { PreparedFixture } from '../features/tournaments/types';
import { UpcomingMatches } from '../features/tournaments/UpcomingMatches';
import { JoinedTournamentMatches } from '../features/tournaments/JoinedTournamentMatches';
import type { LocalMatch, MatchEvent, MatchIntent } from '../features/scoring/domain/match-types';

export function App() {
  const [tab, setTab] = useState<'home' | 'tournaments' | 'matches' | 'leaderboards' | 'profile'>('home');
  const [matchFilter, setMatchFilter] = useState<'UPCOMING' | 'LIVE' | 'COMPLETED'>('LIVE');
  const [matches, setMatches] = useState<LocalMatch[]>([]);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [session, setSession] = useState('');
  const [scoringAccount, setScoringAccount] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [setup, setSetup] = useState(false);
  const [preparedFixture, setPreparedFixture] = useState<PreparedFixture | null>(null);
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
    const subscription = liveQuery(() => db.metadata.get('scoring-account')).subscribe({
      next: (row) => setScoringAccount(row?.value ?? null),
      error: () => setScoringAccount(null),
    });
    return () => subscription.unsubscribe();
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
  const matchOwner = match?.serverAccountId ?? match?.localAccountId;
  const canScore = match && !match.scoringDelegated && match.ownerSessionId === session && (!matchOwner || matchOwner === scoringAccount);
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
    setTab('home');
    setPreparedFixture(null);
    setSetup(false);
    setSelectedId(null);
    setError('');
  }
  function startSetup() {
    setTab('home');
    setPreparedFixture(null);
    setSelectedId(null);
    setSetup(true);
    setError('');
    navigator.storage?.persist?.().catch(() => undefined);
  }
  function navigate(tabName: typeof tab) {
    setTab(tabName);
    setSetup(false);
    setSelectedId(null);
    setError('');
  }
  function prepareFixture(fixture: PreparedFixture) {
    setSelectedId(null);
    setPreparedFixture(fixture);
    setSetup(true);
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
      <div className={`workspace ${setup ? 'workspace-wide' : ''}`}>
        <header className="topbar">
          <span className="topbar-brand"><img src="/brand/raidzon-logo.png" alt="raidzOn" /><span>YOUR COURTSIDE COMPANION</span></span>
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
          <div hidden={!!setup || !!match || (tab !== 'home' && tab !== 'tournaments' && tab !== 'profile')}>
            <AccountSync
              section={tab === 'tournaments' ? 'tournaments' : tab === 'profile' ? 'profile' : 'all'}
              online={online}
              matches={matches}
              onPrepareFixture={prepareFixture}
              onScoreMatch={setSelectedId}
            />
          </div>
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
              key={preparedFixture?.fixtureId ?? 'new-match'}
              preset={preparedFixture}
              session={session}
              onCancel={home}
              onCreated={(created) => {
                setSetup(false);
                setSelectedId(created.id);
              }}
            />
            ) : match && !canScore ? (
              <LiveMatchViewer matchId={match.id} onBack={home} />
            ) : match ? (
            <LiveMatch
              match={match}
              events={events}
              onRecord={record}
              onBack={home}
              saving={saving}
            />
          ) : tab === 'leaderboards' ? (
            <SyncedLeaderboards matches={matches} online={online} />
          ) : tab === 'tournaments' || tab === 'profile' ? null : (
            <>
              {tab === 'matches' ? <header className="list-screen-heading"><h2>Matches</h2><p>Your saved and scheduled games</p></header> : <div className="section-heading">
                <div>
                  <p className="eyebrow">{tab === 'home' ? 'WELCOME TO THE COURT' : 'MATCH CENTER'}</p>
                  <h1>{tab === 'home' ? 'Ready for the next raid?' : 'Your matches'}</h1>
                  <p>Keep your focus on the game. We’ll keep the score.</p>
                </div>
                <span className="date-label">
                  {new Intl.DateTimeFormat('en', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  }).format(new Date())}
                </span>
              </div>}
              {tab === 'matches' && <div className="list-filter-tabs" role="tablist" aria-label="Match status">
                {(['UPCOMING', 'LIVE', 'COMPLETED'] as const).map((status) => <button type="button" role="tab" aria-selected={matchFilter === status} className={matchFilter === status ? 'active' : ''} key={status} onClick={() => setMatchFilter(status)}>{status[0] + status.slice(1).toLowerCase()}</button>)}
              </div>}
              {tab === 'home' && <section className="hero">
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
              </section>}
              {tab === 'home' && <div className="home-stats">
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
              </div>}
              <section className={`matches-section ${tab === 'matches' ? 'matches-screen' : ''}`}>
                <div className="panel-title">
                  <h2>
                    Your matches <span className="count">{matches.length}</span>
                  </h2>
                  <span className="muted">Most recently played</span>
                </div>
                {tab === 'matches' && matchFilter === 'UPCOMING' ? (
                  <UpcomingMatches matches={matches} online={online} onPrepare={prepareFixture} />
                ) : !loaded ? (
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
                    {matches.filter((item) => tab !== 'matches' || (matchFilter === 'LIVE' && item.state.status !== 'COMPLETED') || (matchFilter === 'COMPLETED' && item.state.status === 'COMPLETED')).map((item) => (
                      <button
                        className={`match-card ${tab === 'matches' ? 'match-list-card' : ''}`}
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
                        {tab === 'matches' && <small className="match-card-context">{item.name} · Raid #{item.state.raidNumber}</small>}
                        {tab === 'matches' && <div className="match-card-score"><span><b>{item.state.teams[0].name.slice(0, 3).toUpperCase()}</b><small>{item.state.teams[0].name}</small></span><strong>{item.state.scores[0]} : {item.state.scores[1]}</strong><span><b>{item.state.teams[1].name.slice(0, 3).toUpperCase()}</b><small>{item.state.teams[1].name}</small></span></div>}
                        {tab !== 'matches' && <>
                        <h3>
                          {item.state.teams[0].name}
                          <strong>{item.state.scores[0]}</strong>
                        </h3>
                        <h3>
                          {item.state.teams[1].name}
                          <strong>{item.state.scores[1]}</strong>
                        </h3>
                        </>}
                        <p>
                          {item.state.status === 'COMPLETED' ? 'View result' : 'Resume match'}{' '}
                          <span>→</span>
                        </p>
                      </button>
                    ))}
                    {tab === 'matches' && matchFilter !== 'UPCOMING' && !matches.some((item) => matchFilter === 'LIVE' ? item.state.status !== 'COMPLETED' : item.state.status === 'COMPLETED') && <div className="list-empty">No {matchFilter.toLowerCase()} matches yet.</div>}
                  </div>
                )}
                {tab === 'matches' && <JoinedTournamentMatches filter={matchFilter} online={online} matches={matches} onScoreMatch={setSelectedId} />}
                {tab === 'matches' && <button className="match-create-action" disabled={!session} onClick={startSetup}>+ New standalone match</button>}
              </section>
              {tab === 'home' && <div className="local-note">
                <span>◈</span>
                <p>
                  <strong>Built to keep going.</strong> Matches stay on this browser. Sign in and
                  sync to save a copy to your account when connected.
                </p>
              </div>}
            </>
          )}
        </main>
        {!setup && !match && (
          <nav className="bottom-nav" aria-label="Main navigation">
            {(['home', 'tournaments', 'matches', 'leaderboards', 'profile'] as const).map((item) => (
              <button key={item} className={tab === item ? 'active' : ''} onClick={() => navigate(item)} aria-current={tab === item ? 'page' : undefined}>
                <span aria-hidden="true">{{ home: '⌂', tournaments: '▦', matches: '◉', leaderboards: '▥', profile: '●' }[item]}</span>
                {item[0].toUpperCase() + item.slice(1)}
              </button>
            ))}
          </nav>
        )}
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
