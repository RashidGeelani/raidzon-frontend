import { beforeEach, expect, it } from 'vitest';
import { clearAllSetupDrafts, clearSetupDraft, listSetupDrafts, loadSetupDraft, saveSetupDraft, type SetupDraft } from './setup-draft';
import type { PreparedFixture } from '../../tournaments/types';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  };
});

const fixture = { fixtureId: 'fixture-1', teamA: 'Raiders', teamB: 'Defenders' } as PreparedFixture;
const draft = (preset: PreparedFixture | null, savedAt: number): SetupDraft => ({
  preset,
  teams: [
    { name: preset?.teamA ?? 'Valley', players: [] },
    { name: preset?.teamB ?? 'City', players: [] },
  ],
  firstTurn: 1,
  halfMinutes: 15,
  practice: false,
  savedAt,
});

it('keeps a friendly draft and each fixture draft apart, newest first', () => {
  saveSetupDraft(draft(null, 1));
  saveSetupDraft(draft(fixture, 2));
  expect(loadSetupDraft()?.teams[0].name).toBe('Valley');
  expect(loadSetupDraft(fixture)?.teams[0].name).toBe('Raiders');
  expect(listSetupDrafts().map((d) => d.savedAt)).toEqual([2, 1]);

  clearSetupDraft(fixture);
  expect(loadSetupDraft(fixture)).toBeNull();
  expect(loadSetupDraft()).not.toBeNull();
});

it('sign out clears every draft but leaves other settings', () => {
  store.set('raidzon.display', '{}');
  saveSetupDraft(draft(null, 1));
  saveSetupDraft(draft(fixture, 2));
  clearAllSetupDrafts();
  expect(listSetupDrafts()).toEqual([]);
  expect(store.has('raidzon.display')).toBe(true);
});
