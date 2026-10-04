import { useSyncExternalStore } from 'react';

/**
 * Install ("Add to Home screen") support.
 *
 * - Android/desktop Chrome and Edge fire `beforeinstallprompt`; we keep it and show our own card,
 *   whose button opens the browser's install dialog.
 * - iPhone/iPad Safari has no install event, so we show a short Share → Add to Home Screen guide.
 * - In-app browsers (WhatsApp, Instagram, Facebook…) cannot install at all, so we offer to open
 *   the page in Chrome (Android) or explain how to open it in Safari (iOS).
 *
 * Nudges are shown only at meaningful moments (after scoring a match, after following a
 * tournament, while watching live), never on a first visit, and "Not now" pauses them for 14 days.
 */

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallPlatform = 'native' | 'ios' | 'in-app-android' | 'in-app-ios' | 'unsupported';
export type NudgeReason = 'scored' | 'followed' | 'watching';

export interface InstallState {
  /** Already running from the home screen, or installed during this visit. */
  installed: boolean;
  /** How this browser can install: our button (native), the iOS guide, or open-in-browser help. */
  platform: InstallPlatform;
  /** The browser has offered an install prompt we can open. */
  canPrompt: boolean;
  /** A nudge waiting to be shown, if any. */
  nudge: NudgeReason | null;
}

const SNOOZE_KEY = 'raidzon.install.snoozedUntil';
const SNOOZE_DAYS = 14;
const listeners = new Set<() => void>();
let deferred: InstallPromptEvent | null = null;

function readSnooze(): number {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

export function detectPlatform(userAgent: string, standalone: boolean): InstallPlatform {
  if (standalone) return 'native';
  const ios =
    /iPhone|iPad|iPod/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) && /Mobile/i.test(userAgent));
  const inApp = /WhatsApp|FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|Twitter|; wv\)/i.test(
    userAgent,
  );
  if (inApp)
    return ios ? 'in-app-ios' : /Android/i.test(userAgent) ? 'in-app-android' : 'unsupported';
  if (ios) return /CriOS|FxiOS|EdgiOS/i.test(userAgent) ? 'unsupported' : 'ios';
  return 'native';
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

let state: InstallState = {
  installed: isStandalone(),
  platform:
    typeof navigator === 'undefined' ? 'unsupported' : detectPlatform(navigator.userAgent, false),
  canPrompt: false,
  nudge: null,
};

function set(change: Partial<InstallState>) {
  state = { ...state, ...change };
  listeners.forEach((listener) => listener());
}

if (typeof window !== 'undefined') {
  // An offer that arrived before this code loaded (caught by the inline script in index.html).
  const early = (window as Window & { __raidzonInstallEvent?: InstallPromptEvent })
    .__raidzonInstallEvent;
  if (early) {
    deferred = early;
    state = { ...state, canPrompt: true };
  }
  // Registered at import time (from main.tsx) because Chrome can fire this before React mounts.
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // we show our own card at the right moment instead of the mini-bar
    deferred = event as InstallPromptEvent;
    set({ canPrompt: true });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    set({ installed: true, canPrompt: false, nudge: null });
  });
}

/** True when this browser can install in some way (button, iOS guide or open-in-browser help). */
export function canOfferInstall(current: InstallState = state): boolean {
  if (current.installed) return false;
  if (current.platform === 'native') return current.canPrompt;
  return current.platform !== 'unsupported';
}

/** Ask to show an install nudge for a meaningful moment; ignored if snoozed or not possible. */
export function requestInstallNudge(reason: NudgeReason, now = Date.now()) {
  if (state.nudge || !canOfferInstall() || readSnooze() > now) return;
  set({ nudge: reason });
}

/** "Not now": hide the nudge and pause nudges for two weeks. The Profile card stays available. */
export function snoozeInstall(now = Date.now()) {
  try {
    localStorage.setItem(SNOOZE_KEY, String(now + SNOOZE_DAYS * 24 * 60 * 60 * 1000));
  } catch {
    /* private mode: the nudge may return on the next visit */
  }
  set({ nudge: null });
}

export function closeNudge() {
  set({ nudge: null });
}

/** Opens the browser's install dialog. Returns true if the person accepted. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null; // a prompt can only be used once
  set({ canPrompt: false });
  await event.prompt();
  const choice = await event.userChoice;
  if (choice.outcome === 'accepted') set({ installed: true, nudge: null });
  return choice.outcome === 'accepted';
}

/** Android intent link that opens the current page in Chrome from an in-app browser. */
export function chromeIntentUrl(href: string): string {
  const url = new URL(href);
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${url.protocol.replace(':', '')};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

/** Test hook: reset module state. */
export function __resetInstallForTests(next: Partial<InstallState> = {}) {
  deferred = null;
  state = { installed: false, platform: 'native', canPrompt: false, nudge: null, ...next };
  listeners.forEach((listener) => listener());
}
export function __setDeferredForTests(event: InstallPromptEvent | null) {
  deferred = event;
  set({ canPrompt: !!event });
}
export function __peekInstallForTests(): InstallState {
  return state;
}
