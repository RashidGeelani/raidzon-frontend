import { useCallback, useEffect, useRef, useState } from 'react';
import { Tabs } from '../ui/Tabs';
import { Chip } from '../ui/Chip';
import { DisplaySettingsCard } from './DisplaySettingsCard';
import { InstallCard } from './InstallPrompt';
import { requestInstallNudge } from './install';
import { ProfileAvatar } from './ProfileAvatar';
import { restoreSession } from '../features/identity/data/session-store';
import { liveQuery } from 'dexie';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useNewVersionReady } from './update-on-launch';
import { db, deleteLocalMatch, recordEvent, sessionId } from '../features/matches/data/match-repository';
import { api, ApiError } from '../features/identity/data/auth-client';
import { MatchSetup } from '../features/matches/components/MatchSetup';
import { LiveMatch } from '../features/scoring/components/LiveMatch';
import { LiveMatchViewer } from '../features/scorecard/LiveMatchViewer';
import { AccountSync } from '../features/identity/components/AccountSync';
import { LocalLeaderboards } from '../features/scoring/components/LocalLeaderboards';
import { HomeFeed } from './HomeFeed';
import type { PreparedFixture } from '../features/tournaments/types';
import { UpcomingMatches } from '../features/tournaments/UpcomingMatches';
import { JoinedTournamentMatches } from '../features/tournaments/JoinedTournamentMatches';
import type { LocalMatch, MatchEvent, MatchIntent } from '../features/scoring/domain/match-types';
import { NotificationBell } from '../features/notifications/NotificationBell';
import { pushNow } from '../features/sync/data/live-sync';
import { needsSync } from '../features/sync/data/sync-matches';
import { LiveSyncBadge } from '../features/sync/LiveSyncBadge';
import { ShareMatchPopup } from '../features/scorecard/ShareMatchPopup';
import { FixtureLinkNotice } from '../features/sync/FixtureLinkNotice';
import type { Focus } from '../features/notifications/notification-client';

function readFlag(key: string) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
function writeFlag(key: string) {
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* private mode: the splash simply plays again */
  }
}

export function App() {
  const [startup, setStartup] = useState<'splash' | 'signin' | 'ready'>('splash');
  const finishSignIn = useCallback(
    () => setStartup((current) => (current === 'signin' ? 'ready' : current)),
    [],
  );
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    // The full splash plays on the first launch only; afterwards the app opens almost at once.
    const seen = readFlag('raidzon.launched');
    const minimumSplash = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, seen ? 250 : 1200);
    });
    void Promise.all([restoreSession().catch(() => null), minimumSplash]).then(([account]) => {
      writeFlag('raidzon.launched');
      // A guest who chose "Continue offline" before goes straight to the app.
      if (active) setStartup(account || readFlag('raidzon.guest') ? 'ready' : 'signin');
    });
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);
  const [tab, setTab] = useState<'home' | 'tournaments' | 'teams' | 'matches' | 'profile'>('home');
  const [matchFilter, setMatchFilter] = useState<'UPCOMING' | 'LIVE' | 'COMPLETED'>('LIVE');
  const [matches, setMatches] = useState<LocalMatch[]>([]);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [session, setSession] = useState('');
  const [scoringAccount, setScoringAccount] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [setup, setSetup] = useState(false);
  const [preparedFixture, setPreparedFixture] = useState<PreparedFixture | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);
  const closeShare = useCallback(() => setShareId(null), []);
  const busy = useRef(false);
  // Registers the service worker; new versions take over on their own (see update-on-launch.ts).
  useRegisterSW();
  const needRefresh = useNewVersionReady();
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
  // Opening a match or reconnecting uploads anything still pending, without waiting for the background loop.
  useEffect(() => {
    if (selectedId && online) void pushNow(selectedId);
  }, [selectedId, online]);
  // Anything the server has not acknowledged yet is sent again, whatever happened to the tap that
  // recorded it (a failed save, a reload, a dropped connection).
  const unsent = !!match && needsSync(match);
  useEffect(() => {
    if (match && online && unsent) void pushNow(match.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.id, match?.version, match?.serverVersion, online, unsent]);
  const matchOwner = match?.serverAccountId ?? match?.localAccountId;
  const canScore =
    match &&
    !match.scoringDelegated &&
    match.ownerSessionId === session &&
    (!matchOwner || matchOwner === scoringAccount);
  const canScoreMatch = (item: LocalMatch) => {
    const owner = item.serverAccountId ?? item.localAccountId;
    return (
      !item.scoringDelegated &&
      item.ownerSessionId === session &&
      (!owner || owner === scoringAccount)
    );
  };
  // Finishing a match you scored is the best moment to suggest installing.
  const previousStatus = useRef<{ id: string; status: string } | null>(null);
  useEffect(() => {
    if (!match) {
      previousStatus.current = null;
      return;
    }
    const before = previousStatus.current;
    if (
      before?.id === match.id &&
      before.status !== 'COMPLETED' &&
      match.state.status === 'COMPLETED' &&
      canScore
    )
      requestInstallNudge('scored');
    previousStatus.current = { id: match.id, status: match.state.status };
  }, [match, canScore]);
  // Home-screen shortcuts (see the manifest) open the app with ?action=score or ?tab=….
  const shortcutHandled = useRef(false);
  useEffect(() => {
    if (startup !== 'ready' || !session || shortcutHandled.current) return;
    shortcutHandled.current = true;
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    const tabParam = params.get('tab');
    if (!action && !tabParam) return;
    window.history.replaceState(null, '', window.location.pathname);
    if (action === 'score') startSetup();
    else if (
      tabParam === 'tournaments' ||
      tabParam === 'matches' ||
      tabParam === 'teams' ||
      tabParam === 'profile'
    )
      navigate(tabParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startup, session]);
  // A new version is ready: switch now unless a match is open or being set up.
  useEffect(() => {
    if (needRefresh && !selectedId && !setup) window.location.reload();
  }, [needRefresh, selectedId, setup]);
  // Scoring and match setup are task screens: no app header, footer or tab bar.
  const taskScreen = startup === 'ready' && (setup || !!match);
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
      // Online scoring: send this tap to the server now so watchers see it within a second.
      void pushNow(match.id);
      busy.current = false;
      setSaving(false);
    }
  }
  /**
   * Deletes the open match (creator only, before the first event or while paused). A match already on RaidzOn is
   * deleted there first, so watchers and the tournament stop showing it; then it leaves this phone.
   */
  async function deleteMatch() {
    if (!match) return;
    const account = await restoreSession().catch(() => null);
    const onServer = !!match.serverAccountId;
    if (onServer && !account) throw new Error('Sign in again to delete this match from RaidzOn.');
    if (onServer && !online) throw new Error('Connect to the internet to delete this match. It is also saved on RaidzOn.');
    if (account && online) {
      try {
        await api(`/matches/${match.id}/delete`, {}, account.token);
      } catch (cause) {
        // Not on the server yet: deleting it from this phone is enough.
        if (!(cause instanceof ApiError && cause.status === 404)) throw cause;
      }
    }
    await deleteLocalMatch(match.id);
    home();
  }
  function home() {
    setShareId(null);
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
  function openTournament(id: string) {
    setSetup(false);
    setSelectedId(null);
    setError('');
    setTab('tournaments');
    setFocus({ tournamentId: id, view: 'public', nonce: Date.now() });
  }
  function openNotification(next: Focus) {
    setSetup(false);
    setSelectedId(null);
    setError('');
    setTab(next.teamId ? 'teams' : 'tournaments');
    setFocus(next);
  }
  function prepareFixture(fixture: PreparedFixture) {
    setSelectedId(null);
    setPreparedFixture(fixture);
    setSetup(true);
  }
  return (
    <div className={`app-shell ${startup !== 'ready' ? 'startup-shell' : ''}`}>
      {startup === 'splash' && (
        <div className="launch-splash" role="status" aria-label="Starting raidzOn">
          <img src="/brand/raidzon-logo-256.webp" alt="" />
          <h1>
            raidz<span>On</span>
          </h1>
          <p>EVERY RAID. EVERY POINT.</p>
          <span className="launch-progress" />
        </div>
      )}
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            home();
          }}
        >
          <img src="/brand/raidzon-logo-256.webp" alt="raidzOn — Every raid, every point" />
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
      <div
        className={`workspace ${setup ? 'workspace-wide' : ''} ${taskScreen ? 'task-screen' : ''}`}
      >
        <header className="topbar">
          <span className="topbar-brand">
            <img src="/brand/raidzon-logo-256.webp" alt="raidzOn" />
            <span>YOUR COURTSIDE COMPANION</span>
          </span>
          <div>
            {startup === 'ready' && <NotificationBell online={online} onOpen={openNotification} />}
            {startup === 'ready' && (
              <button
                type="button"
                className={`topbar-profile ${tab === 'profile' ? 'active' : ''}`}
                aria-label="Profile"
                aria-current={tab === 'profile' ? 'page' : undefined}
                onClick={() => navigate('profile')}
              >
                <ProfileAvatar online={online} refreshKey={`${tab}:${startup}`} />
              </button>
            )}
            <span
              className={`network ${online ? '' : 'network-offline'}`}
              title={online ? 'Online' : 'Offline: scores are saved on this phone'}
            >
              <i className={`dot ${online ? 'live' : ''}`} />
              {online ? 'Online' : 'Offline'}
            </span>
          </div>
        </header>
        <main>
          <div
            className={startup === 'signin' ? 'account-entry signin-screen' : 'account-entry'}
            hidden={
              startup === 'splash' ||
              (startup === 'ready' &&
                (!!setup ||
                  !!match ||
                  (tab !== 'tournaments' && tab !== 'teams' && tab !== 'profile')))
            }
          >
            {startup === 'signin' && (
              <header className="signin-brand">
                <img src="/brand/raidzon-logo-256.webp" alt="" />
                <p className="signin-wordmark">
                  raidz<span>On</span>
                </p>
                <h1>Welcome to the court</h1>
                <p>Sign in to keep your matches with you.</p>
              </header>
            )}
            <AccountSync
              onSignedIn={finishSignIn}
              section={
                tab === 'tournaments'
                  ? 'tournaments'
                  : tab === 'teams'
                    ? 'teams'
                    : tab === 'profile'
                      ? 'profile'
                      : 'all'
              }
              online={online}
              matches={matches}
              onPrepareFixture={prepareFixture}
              onScoreMatch={setSelectedId}
              focus={focus}
            />
            {startup === 'signin' && (
              <div className="signin-guest">
                <span>or get straight to the game</span>
                <button
                  className="secondary"
                  onClick={() => {
                    writeFlag('raidzon.guest');
                    setStartup('ready');
                  }}
                >
                  Continue offline
                </button>
                <p>No account needed to score. Sign in later from Profile.</p>
              </div>
            )}
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
                // Create the match on the server immediately so it can be watched from the first raid.
                void pushNow(created.id);
                // Signed-in scorers get a live link straight away; it goes public once the upload lands.
                void restoreSession()
                  .catch(() => null)
                  .then((account) => {
                    if (account) setShareId(created.id);
                  });
              }}
            />
          ) : match && !canScore ? (
            <LiveMatchViewer matchId={match.id} onBack={home} />
          ) : match ? (
            <>
              <LiveSyncBadge
                matchId={match.id}
                online={online}
                pending={unsent}
                syncError={match.syncError}
              />
              <FixtureLinkNotice match={match} online={online} />
              <LiveMatch
                match={match}
                events={events}
                onRecord={record}
                onBack={home}
                onShare={() => setShareId(match.id)}
                onDelete={deleteMatch}
                saving={saving}
              />
              {shareId === match.id && (
                <ShareMatchPopup matchId={match.id} online={online} onClose={closeShare} />
              )}
            </>
          ) : tab === 'home' ? (
            <HomeFeed
              matches={matches}
              canResume={canScoreMatch}
              online={online}
              loaded={loaded}
              session={session}
              onOpenMatch={(id) => {
                setSelectedId(id);
                setError('');
              }}
              onStartMatch={startSetup}
              onPrepare={prepareFixture}
              onOpenTournament={openTournament}
              onBrowseTournaments={() => navigate('tournaments')}
            />
          ) : tab === 'profile' ? (
            <>
              <InstallCard />
              <DisplaySettingsCard />
            </>
          ) : tab === 'tournaments' || tab === 'teams' ? null : (
            <>
              <header className="list-screen-heading">
                <h2>Matches</h2>
                <p>Live, upcoming and finished games</p>
              </header>
              <Tabs
                label="Match status"
                value={matchFilter}
                onChange={setMatchFilter}
                items={[
                  { value: 'UPCOMING', label: 'Upcoming' },
                  { value: 'LIVE', label: 'Live' },
                  { value: 'COMPLETED', label: 'Completed' },
                ]}
              />
              <section className="matches-section matches-screen">
                <div className="panel-title">
                  <h2>
                    Your matches <span className="count">{matches.length}</span>
                  </h2>
                  <span className="muted">Most recently played</span>
                </div>
                {matchFilter === 'UPCOMING' ? (
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
                    {matches
                      .filter(
                        (item) =>
                          (matchFilter === 'LIVE' && item.state.status !== 'COMPLETED') ||
                          (matchFilter === 'COMPLETED' && item.state.status === 'COMPLETED'),
                      )
                      .map((item) => (
                        <button
                          className="match-card match-list-card"
                          key={item.id}
                          onClick={() => {
                            setSelectedId(item.id);
                            setError('');
                          }}
                        >
                          <div>
                            <Chip tone={item.state.status === 'COMPLETED' ? 'success' : 'live'}>
                              {item.state.status === 'COMPLETED'
                                ? 'Full time'
                                : item.state.status === 'LIVE'
                                  ? '● Live'
                                  : item.state.status.replaceAll('_', ' ').toLowerCase()}
                            </Chip>
                            {item.practice && <Chip>Practice</Chip>}
                            <small>
                              {item.serverAccountId &&
                              item.serverVersion === item.version &&
                              !item.syncError
                                ? 'Backed up'
                                : 'On this phone'}
                            </small>
                          </div>
                          {
                            <small className="match-card-context">
                              {item.name} · Raid #{item.state.raidNumber}
                            </small>
                          }
                          {
                            <div className="match-card-score">
                              <span>
                                <b>{item.state.teams[0].name.slice(0, 3).toUpperCase()}</b>
                                <small>{item.state.teams[0].name}</small>
                              </span>
                              <strong>
                                {item.state.scores[0]} : {item.state.scores[1]}
                              </strong>
                              <span>
                                <b>{item.state.teams[1].name.slice(0, 3).toUpperCase()}</b>
                                <small>{item.state.teams[1].name}</small>
                              </span>
                            </div>
                          }
                          <p>
                            {item.state.status === 'COMPLETED' ? 'View result' : 'Resume match'}{' '}
                            <span>→</span>
                          </p>
                        </button>
                      ))}
                    {!matches.some((item) =>
                      matchFilter === 'LIVE'
                        ? item.state.status !== 'COMPLETED'
                        : item.state.status === 'COMPLETED',
                    ) && (
                      <div className="list-empty">No {matchFilter.toLowerCase()} matches yet.</div>
                    )}
                  </div>
                )}
                {
                  <JoinedTournamentMatches
                    filter={matchFilter}
                    online={online}
                    matches={matches}
                    onScoreMatch={setSelectedId}
                  />
                }
              </section>
              <details className="panel local-stats">
                <summary>Player stats from matches on this phone</summary>
                <LocalLeaderboards matches={matches} />
              </details>
            </>
          )}
        </main>
        {!taskScreen && (
          <nav className="bottom-nav" aria-label="Main navigation">
            {(['home', 'matches', 'score', 'tournaments', 'teams'] as const).map((item) =>
              item === 'score' ? (
                <button
                  key={item}
                  className="nav-score"
                  disabled={!session}
                  onClick={startSetup}
                  aria-label="Score a new match"
                >
                  <span aria-hidden="true">＋</span>
                  Score
                </button>
              ) : (
                <button
                  key={item}
                  className={tab === item ? 'active' : ''}
                  onClick={() => navigate(item)}
                  aria-current={tab === item ? 'page' : undefined}
                >
                  <span aria-hidden="true">
                    {{ home: '⌂', tournaments: '▦', teams: '⚑', matches: '◉' }[item]}
                  </span>
                  {item[0].toUpperCase() + item.slice(1)}
                </button>
              ),
            )}
          </nav>
        )}
        <footer>
          <span>
            raidzOn <b>·</b> Every raid has a story.
          </span>
          <span>Testing · v0.1</span>
        </footer>
        {needRefresh && (
          <div className="update-banner">
            An app update is ready. Finish scoring before updating.
            <button
              disabled={(!!match && match.state.status !== 'COMPLETED') || setup}
              onClick={() => window.location.reload()}
            >
              Update app
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
