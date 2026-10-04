import { beforeEach, expect, it } from 'vitest';
import {
  __resetInstallForTests,
  __setDeferredForTests,
  canOfferInstall,
  chromeIntentUrl,
  detectPlatform,
  promptInstall,
  requestInstallNudge,
  snoozeInstall,
  __peekInstallForTests,
} from './install';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  };
  __resetInstallForTests();
});

const fakePrompt = (outcome: 'accepted' | 'dismissed') =>
  Object.assign(new Event('beforeinstallprompt'), {
    prompt: async () => {},
    userChoice: Promise.resolve({ outcome }),
  });

it('recognises browsers by how they can install', () => {
  const android =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36';
  const iphone =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1';
  expect(detectPlatform(android, false)).toBe('native');
  expect(detectPlatform(iphone, false)).toBe('ios');
  expect(detectPlatform(`${android} WhatsApp/2.24`, false)).toBe('in-app-android');
  expect(detectPlatform(`${iphone} Instagram 300`, false)).toBe('in-app-ios');
  expect(detectPlatform(iphone.replace('Version/17.5', 'CriOS/128'), false)).toBe('unsupported');
  expect(detectPlatform(iphone, true)).toBe('native');
});

it('only offers native install once the browser has provided a prompt', () => {
  expect(
    canOfferInstall({ installed: false, platform: 'native', canPrompt: false, nudge: null }),
  ).toBe(false);
  expect(
    canOfferInstall({ installed: false, platform: 'native', canPrompt: true, nudge: null }),
  ).toBe(true);
  expect(
    canOfferInstall({ installed: false, platform: 'ios', canPrompt: false, nudge: null }),
  ).toBe(true);
  expect(canOfferInstall({ installed: true, platform: 'ios', canPrompt: false, nudge: null })).toBe(
    false,
  );
  expect(
    canOfferInstall({ installed: false, platform: 'unsupported', canPrompt: false, nudge: null }),
  ).toBe(false);
});

it('shows a nudge at a meaningful moment and "Not now" pauses it for two weeks', () => {
  const states: string[] = [];
  __setDeferredForTests(fakePrompt('dismissed') as never);
  requestInstallNudge('scored', 1_000);
  states.push(String(readNudge()));
  snoozeInstall(1_000);
  states.push(String(readNudge()));
  requestInstallNudge('followed', 1_000 + 13 * 86_400_000);
  states.push(String(readNudge()));
  requestInstallNudge('followed', 1_000 + 15 * 86_400_000);
  states.push(String(readNudge()));
  expect(states).toEqual(['scored', 'null', 'null', 'followed']);
});

it('does not nudge when the browser cannot install', () => {
  requestInstallNudge('watching');
  expect(readNudge()).toBeNull();
});

it('marks the app installed when the person accepts the dialog', async () => {
  __setDeferredForTests(fakePrompt('accepted') as never);
  expect(await promptInstall()).toBe(true);
  expect(readInstalled()).toBe(true);
  expect(await promptInstall()).toBe(false); // a prompt can only be used once
});

it('builds a Chrome intent link that falls back to the page', () => {
  const link = chromeIntentUrl('https://www.raidzon.com/watch/abc?x=1');
  expect(
    link.startsWith(
      'intent://www.raidzon.com/watch/abc?x=1#Intent;scheme=https;package=com.android.chrome;',
    ),
  ).toBe(true);
  expect(link).toContain(
    `S.browser_fallback_url=${encodeURIComponent('https://www.raidzon.com/watch/abc?x=1')}`,
  );
});

function readNudge() {
  return __peekInstallForTests().nudge;
}
function readInstalled() {
  return __peekInstallForTests().installed;
}
