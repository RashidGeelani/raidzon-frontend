import { api, ApiError, apiBaseUrl } from '../identity/data/auth-client';

export type LiveConnection = 'connecting' | 'live' | 'reconnecting';
/** Sent the moment an event is accepted, before the full view (event list, own names) follows. */
export interface LiveStateUpdate<S = unknown> { version: number; serverTime: number; state: S }
const RECONNECT_SECONDS = [1, 2, 5, 10, 15];
const WATCHDOG_MS = 70_000; // the server sends a keepalive every 25s
const FALLBACK_POLL_MS = 10_000;

export function liveSocketUrl(matchId: string, base = apiBaseUrl(), origin = globalThis.location?.origin ?? '') {
  return `${(base || origin).replace(/^http/, 'ws')}/ws/matches/${encodeURIComponent(matchId)}`;
}

/**
 * Watches a match: WebSocket pushes every accepted event; while the socket is down it reconnects
 * with backoff and polls the REST endpoint every 10s so the score never freezes.
 */
export function watchMatch<V>(
  matchId: string,
  handlers: {
    onView: (view: V) => void;
    onUnavailable: () => void;
    onConnection: (state: LiveConnection) => void;
    onState?: (update: LiveStateUpdate) => void;
  },
  deps: { WebSocketImpl?: typeof WebSocket; fetchView?: () => Promise<V> } = {},
) {
  const Socket = deps.WebSocketImpl ?? WebSocket;
  const fetchView = deps.fetchView ?? (() => api<V>(`/public/matches/${encodeURIComponent(matchId)}`));
  let stopped = false;
  let socket: WebSocket | null = null;
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let poller: ReturnType<typeof setInterval> | undefined;

  const poll = () => fetchView().then((view) => { if (!stopped) handlers.onView(view); }).catch((error) => {
    if (!stopped && error instanceof ApiError && error.status === 404) handlers.onUnavailable();
  });
  const startPolling = () => { if (!poller) { void poll(); poller = setInterval(() => void poll(), FALLBACK_POLL_MS); } };
  const stopPolling = () => { if (poller) clearInterval(poller); poller = undefined; };
  const armWatchdog = () => { if (watchdog) clearTimeout(watchdog); watchdog = setTimeout(() => socket?.close(), WATCHDOG_MS); };

  function connect() {
    if (stopped) return;
    handlers.onConnection(attempt === 0 ? 'connecting' : 'reconnecting');
    // If the socket can't even be created (e.g. blocked), poll meanwhile so watchers still see scores.
    try { socket = new Socket(liveSocketUrl(matchId)); } catch { startPolling(); scheduleReconnect(); return; }
    socket.onopen = () => { attempt = 0; stopPolling(); armWatchdog(); handlers.onConnection('live'); };
    socket.onmessage = (event) => {
      armWatchdog();
      try {
        const message = JSON.parse(String(event.data)) as { type: string; view?: V } & Partial<LiveStateUpdate>;
        if (message.type === 'view' && message.view) handlers.onView(message.view);
        else if (message.type === 'state' && message.state && typeof message.version === 'number')
          handlers.onState?.({ version: message.version, serverTime: message.serverTime ?? Date.now(), state: message.state });
        else if (message.type === 'unavailable') handlers.onUnavailable();
      } catch { /* ignore malformed frames */ }
    };
    socket.onclose = () => { if (watchdog) clearTimeout(watchdog); socket = null; if (!stopped) { startPolling(); scheduleReconnect(); } };
    socket.onerror = () => socket?.close();
  }
  function scheduleReconnect() {
    if (stopped) return;
    const seconds = RECONNECT_SECONDS[Math.min(attempt, RECONNECT_SECONDS.length - 1)];
    attempt++;
    handlers.onConnection('reconnecting');
    reconnectTimer = setTimeout(connect, seconds * 1000);
  }
  connect();
  return () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (watchdog) clearTimeout(watchdog);
    stopPolling();
    socket?.close();
  };
}
