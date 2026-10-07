import { expect, it } from 'vitest';
import { byJersey, withJersey } from './jersey';

it('labels players by shirt number and finds them by a typed number', () => {
  const players = [{ name: 'Waseem', jersey: 7 }, { name: 'Rashid', jersey: 0 }, { name: 'Old', jersey: undefined }];
  expect(withJersey(players[0])).toBe('#7 Waseem');
  expect(withJersey(players[2])).toBe('Old');
  expect(byJersey(players, '7')?.name).toBe('Waseem');
  expect(byJersey(players, ' 0 ')?.name).toBe('Rashid');
  expect(byJersey(players, '07')?.name).toBe('Waseem'); // a leading zero is the same number
  expect(byJersey(players, '12')).toBeUndefined();
  expect(byJersey(players, 'x')).toBeUndefined();
});
