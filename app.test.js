import { describe, expect, test } from '@jest/globals';
import { getColor } from './app';

describe('getColor', () => {
  test('returns consistent color for a username', () => {
    const user = 'Alice';
    const color1 = getColor(user);
    const color2 = getColor(user);
    expect(color1).toBe(color2);
  });

  test('returns different color for different usernames', () => {
    const color1 = getColor('Alice');
    const color2 = getColor('Bob');
    expect(color1).not.toBe(color2);
  });

  test('returns valid HSL color string', () => {
    const color = getColor('TestUser');
    expect(color).toMatch(/^hsl\(\d{1,3}, 70%, 45%\)$/);
  });
});
