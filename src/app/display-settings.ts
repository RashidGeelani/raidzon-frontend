import { useSyncExternalStore } from 'react';

/**
 * Per-phone display preferences: sideline mode gives bigger text and tap targets for scoring
 * outdoors; theme is light, dark or the phone's own setting. Stored in localStorage; private
 * browsing simply falls back to the defaults. index.html applies the theme before first paint.
 */
export type ThemeChoice = 'system' | 'light' | 'dark';

export interface DisplaySettings {
  sideline: boolean;
  theme: ThemeChoice;
}

const KEY = 'raidzon.display';
const THEME_COLOR = { light: '#f6f7fb', dark: '#0e0e1c' };
const listeners = new Set<() => void>();
const systemLight =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: light)')
    : null;

function read(): DisplaySettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<DisplaySettings>;
    const theme = parsed.theme === 'light' || parsed.theme === 'dark' ? parsed.theme : 'system';
    return { sideline: parsed.sideline === true, theme };
  } catch {
    return { sideline: false, theme: 'system' };
  }
}

let current = read();
apply(current);
// Following the phone: switch when the phone switches (e.g. its automatic dark mode at night).
systemLight?.addEventListener?.('change', () => apply(current));

export function resolveTheme(theme: ThemeChoice, phonePrefersLight: boolean): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  return phonePrefersLight ? 'light' : 'dark';
}

function apply(settings: DisplaySettings) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (settings.sideline) root.dataset.sideline = 'on';
  else delete root.dataset.sideline;
  // The stream overlay keeps the dark broadcast look whatever this computer's setting is.
  const theme = root.dataset.overlay ? 'dark' : resolveTheme(settings.theme, systemLight?.matches ?? false);
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
}

export function updateDisplaySettings(change: Partial<DisplaySettings>) {
  current = { ...current, ...change };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* not saved in private mode; still applies for this visit */
  }
  apply(current);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDisplaySettings(): DisplaySettings {
  return useSyncExternalStore(subscribe, () => current, () => current);
}
