import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { applyRecordedEvent } from './apply-recorded-event';
import type { MatchEvent, MatchIntent, MatchState } from './match-types';

const initialPath = new URL(
  '../../../../../test-fixtures/matches/initial-state.json',
  import.meta.url,
);
const scenarioPath = new URL(
  '../../../../../test-fixtures/matches/match-scenarios.json',
  import.meta.url,
);
interface Step {
  id: string;
  at: number;
  intent: MatchIntent;
  error?: string;
  expect?: Record<string, unknown>;
  expectedHash?: string;
}
interface Scenario {
  name: string;
  initialOverrides: Record<string, unknown>;
  events: Step[];
}
const initial = JSON.parse(readFileSync(initialPath, 'utf8')) as MatchState;
const scenarios = JSON.parse(readFileSync(scenarioPath, 'utf8')) as Scenario[];
const update = process.env.UPDATE_MATCH_GOLDENS === '1';
let completed = 0;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function get(root: unknown, pointer: string): unknown {
  return pointer
    .split('/')
    .slice(1)
    .reduce((value, key) => (value as Record<string, unknown>)[key], root);
}
function set(root: MatchState, pointer: string, value: unknown) {
  const keys = pointer.split('/').slice(1);
  const last = keys.pop()!;
  const parent = keys.reduce(
    (value, key) => (value as Record<string, unknown>)[key],
    root as unknown,
  ) as Record<string, unknown>;
  parent[last] = structuredClone(value);
}
describe('shared full-match golden scenarios', () => {
  for (const scenario of scenarios)
    it(scenario.name, () => {
      let state = structuredClone(initial);
      for (const [pointer, value] of Object.entries(scenario.initialOverrides))
        set(state, pointer, value);
      const history: Pick<MatchEvent, 'id' | 'intent' | 'before' | 'summary'>[] = [];
      for (const step of scenario.events) {
        const prior = structuredClone(state);
        if (step.error) {
          expect(() => applyRecordedEvent(state, step.intent, step.at, history), step.id).toThrow(
            step.error,
          );
          expect(state).toEqual(prior);
          continue;
        }
        const result = applyRecordedEvent(state, step.intent, step.at, history);
        expect(state, `${step.id}: input must not mutate`).toEqual(prior);
        for (const [pointer, value] of Object.entries(step.expect ?? {}))
          expect(get(result.state, pointer), `${step.id}: ${pointer}`).toEqual(value);
        const hash = createHash('sha256').update(canonical(result)).digest('hex');
        if (update) step.expectedHash = hash;
        else
          expect(hash, `${step.id}: full before/after state, components and summary`).toEqual(
            step.expectedHash,
          );
        history.push({
          id: step.id,
          intent: step.intent,
          before: result.before,
          summary: result.summary,
        });
        state = result.state;
      }
      completed++;
    });
});
afterAll(() => {
  if (update) {
    // Never bless a partially failing set of scenarios.
    expect(completed).toBe(scenarios.length);
    writeFileSync(scenarioPath, JSON.stringify(scenarios, null, 2) + '\n');
  }
});
