import type { TeamInput } from './match-repository';
import type { Side } from '../../scoring/domain/match-types';
import type { PreparedFixture } from '../../tournaments/types';

/**
 * A half-filled match setup, kept on this phone so a refresh or closed app before the match
 * starts doesn't lose the line-ups. One draft per fixture, plus one for a friendly match.
 * Cleared when the match starts, when the scorer clears the form, and on sign out.
 */
export type SetupDraft = {
  preset: PreparedFixture | null;
  teams: [TeamInput, TeamInput];
  firstTurn: Side;
  halfMinutes: number;
  practice: boolean;
  savedAt: number;
};

const PREFIX = 'raidzon.setup-draft:';
const draftKey = (preset?: PreparedFixture | null) => PREFIX + (preset?.fixtureId ?? 'new-match');

export function loadSetupDraft(preset?: PreparedFixture | null): SetupDraft | null {
  try {
    return JSON.parse(localStorage.getItem(draftKey(preset)) ?? 'null') as SetupDraft | null;
  } catch {
    return null;
  }
}
export function saveSetupDraft(draft: SetupDraft) {
  try {
    localStorage.setItem(draftKey(draft.preset), JSON.stringify(draft));
  } catch {
    /* private mode or full storage: the form simply isn't kept */
  }
}
export function clearSetupDraft(preset?: PreparedFixture | null) {
  try {
    localStorage.removeItem(draftKey(preset));
  } catch {
    /* nothing stored */
  }
}
function draftKeys() {
  try {
    return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter(
      (key): key is string => !!key?.startsWith(PREFIX),
    );
  } catch {
    return [];
  }
}
/** Newest first, for the "Continue match setup" cards on home. */
export function listSetupDrafts(): SetupDraft[] {
  return draftKeys()
    .map((key) => {
      try {
        return JSON.parse(localStorage.getItem(key) ?? 'null') as SetupDraft | null;
      } catch {
        return null;
      }
    })
    .filter((draft): draft is SetupDraft => !!draft)
    .sort((a, b) => b.savedAt - a.savedAt);
}
export function clearAllSetupDrafts() {
  for (const key of draftKeys()) localStorage.removeItem(key);
}
