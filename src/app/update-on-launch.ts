import { useSyncExternalStore } from 'react';

/**
 * New versions activate as soon as they are downloaded (skipWaiting + clientsClaim in the
 * service worker), so nobody stays on an old version. A running page keeps its already-loaded code
 * until it reloads:
 *  - read-only pages (watch, scorecard, help, privacy) reload straight away;
 *  - the app reloads by itself when nothing is being scored, otherwise shows "Update app".
 */
let ready = false;
const listeners = new Set<() => void>();

export function watchForNewVersion(readOnlyPage: boolean) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  // A first visit has no controller; taking control then is not a new version.
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    if (readOnlyPage) {
      window.location.reload();
      return;
    }
    ready = true;
    listeners.forEach((listener) => listener());
  });
}

/** True once a newer version has taken over and this page should reload to use it. */
export function useNewVersionReady() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => ready,
    () => ready,
  );
}
