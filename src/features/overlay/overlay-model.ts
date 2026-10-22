/**
 * Broadcast overlay (/overlay/:matchId): a transparent score bar that streamers add to OBS as a
 * Browser Source, or to a phone streaming app that supports web overlays. These helpers hold the
 * logic the page needs; OverlayPage.tsx draws it.
 */
export const DELAY_CHOICES = [0, 5, 10, 15, 20, 30] as const;
export const MAX_DELAY_SECONDS = 60;
/** Players on mat at full strength; the bar shows one dot each. */
export const MAT_SIZE = 7;

/**
 * ?delay=10 holds every update back 10 seconds, so the score changes when the stream shows the raid
 * (YouTube and Facebook streams run 5-20 s behind the court). Anything invalid means no delay.
 */
export function overlayDelayMs(search: string): number {
  const raw = Number(new URLSearchParams(search).get('delay'));
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.round(Math.min(raw, MAX_DELAY_SECONDS) * 1000);
}

export function overlayLink(origin: string, matchId: string, delaySeconds: number) {
  return `${origin}/overlay/${matchId}${delaySeconds > 0 ? `?delay=${delaySeconds}` : ''}`;
}

/**
 * Runs each pushed item delayMs after it arrived, in arrival order (a fixed delay keeps the order).
 * With no delay items run straight away. stop() drops anything still waiting.
 */
export function delayQueue<T>(delayMs: number, run: (item: T) => void) {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  return {
    push(item: T) {
      if (delayMs <= 0) { run(item); return; }
      const timer = setTimeout(() => { timers.delete(timer); run(item); }, delayMs);
      timers.add(timer);
    },
    stop() { timers.forEach(clearTimeout); timers.clear(); },
  };
}

export type OverlayPhase = 'starting' | 'live' | 'break' | 'final';
/** "Starting soon" until the first raid starts; then live, half-time / paused breaks, and full time. */
export function overlayPhase(state: { status: string; currentRaiderId: string | null }, eventCount: number): OverlayPhase {
  if (state.status === 'COMPLETED') return 'final';
  if (eventCount === 0 && !state.currentRaiderId) return 'starting';
  if (state.status === 'HALF_TIME' || state.status === 'PAUSED') return 'break';
  return 'live';
}

/** Players on mat out of seven, for the dots under each team's name. */
export function matCount(players: readonly { status: string }[]) {
  return Math.min(MAT_SIZE, players.filter((player) => player.status === 'ACTIVE').length);
}

export const clockText = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** Short team code for the bar, like the TV graphics: "Bandipora Bulls" → "BAN". */
export const teamCode = (name: string) => name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 3).toUpperCase() || 'TBC';

/** "Sopore Lions" → "SLI": word initials, padded from the last word. */
function initialsCode(name: string) {
  const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const initials = words.map((word) => word[0]).join('');
  return (initials + (words.at(-1)?.slice(1) ?? '')).slice(0, 3).toUpperCase() || 'TBC';
}

/** Both codes for the bar; when they would clash ("Sopore Lions" v "Sopore Tigers") use initials instead. */
export function teamCodes(a: string, b: string): [string, string] {
  const plain: [string, string] = [teamCode(a), teamCode(b)];
  if (plain[0] !== plain[1]) return plain;
  const initials: [string, string] = [initialsCode(a), initialsCode(b)];
  return initials[0] !== initials[1] ? initials : plain;
}
