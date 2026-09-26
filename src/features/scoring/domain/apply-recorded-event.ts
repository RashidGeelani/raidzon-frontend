import { applyEvent, assertState } from './apply-event';
import { remainingTime, type MatchEvent, type MatchIntent, type MatchState } from './match-types';

type HistoryEvent = Pick<MatchEvent, 'id' | 'intent' | 'before' | 'summary'>;

export function undoTarget<T extends HistoryEvent>(events: readonly T[]) {
  const reversed = new Set(
    events.flatMap((e) => (e.intent.type === 'UNDO' ? [e.intent.targetEventId] : [])),
  );
  return [...events].reverse().find((e) => e.intent.type !== 'UNDO' && !reversed.has(e.id));
}

/** Pure audit transition shared by IndexedDB persistence and cross-language replay tests. */
export function applyRecordedEvent(
  previous: MatchState,
  intent: MatchIntent,
  now: number,
  history: readonly HistoryEvent[],
  rulesetVersion: string = 'raidzon-v3',
) {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid event time.');
  const before = structuredClone(previous);
  for (const key of ['clock', 'raidClock'] as const) {
    before[key] = {
      remainingMs: remainingTime(before[key], now),
      startedAt: before[key].startedAt === null ? null : now,
    };
  }
  if (intent.type !== 'UNDO') return { before, ...applyEvent(before, intent, now, rulesetVersion) };
  const target = undoTarget(history);
  if (!target || target.id !== intent.targetEventId)
    throw new Error('Only the latest unreverted event can be undone.');
  const state = structuredClone(target.before);
  if (state.clock.startedAt !== null) state.clock.startedAt = now;
  if (state.raidClock.startedAt !== null) state.raidClock.startedAt = now;
  assertState(state);
  return { before, state, components: [], summary: `Undo: ${target.summary}` };
}
