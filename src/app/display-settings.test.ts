import { expect, it } from 'vitest';
import { resolveTheme } from './display-settings';

it('follows the phone unless a theme was picked in Profile', () => {
  expect(resolveTheme('system', true)).toBe('light');
  expect(resolveTheme('system', false)).toBe('dark');
  expect(resolveTheme('dark', true)).toBe('dark');
  expect(resolveTheme('light', false)).toBe('light');
});
