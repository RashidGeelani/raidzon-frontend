import { useSyncExternalStore } from 'react';

/**
 * Per-phone display preference: sideline mode gives bigger text and tap targets for scoring
 * outdoors. Stored in localStorage; private browsing simply falls back to the default.
 */
export interface DisplaySettings {
  sideline: boolean;
}

const KEY = 'raidzon.display';
const listeners = new Set<() => void>();

function read(): DisplaySettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<DisplaySettings>;
    return { sideline: parsed.sideline === true };
  } catch {
    return { sideline: false };
  }
}

let current = read();
apply(current);

function apply(settings: DisplaySettings) {
  if (typeof document === 'undefined') return;
  if (settings.sideline) document.documentElement.dataset.sideline = 'on';
  else delete document.documentElement.dataset.sideline;
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
