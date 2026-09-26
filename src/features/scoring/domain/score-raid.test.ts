import { describe, expect, it } from 'vitest';
import scenarios from '../../../../../test-fixtures/scoring/raid-scenarios.json';
import { scoreRaid, type RaidFacts } from './score-raid';

describe('shared Java / TypeScript scoring scenarios', () => {
  for (const scenario of scenarios) {
    it(scenario.name, () => {
      if (scenario.error)
        expect(() => scoreRaid(scenario.facts as RaidFacts)).toThrow(scenario.error);
      else expect(scoreRaid(scenario.facts as RaidFacts)).toEqual(scenario.expected);
    });
  }
});
