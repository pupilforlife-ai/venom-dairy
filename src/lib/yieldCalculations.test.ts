import { describe, expect, it } from 'vitest';
import { calculateYieldPercent } from './yieldCalculations';

describe('calculateYieldPercent', () => {
  it('calculates output as a percentage of input', () => {
    expect(calculateYieldPercent(24, 60)).toBe(40);
  });

  it('returns null when input is zero or invalid', () => {
    expect(calculateYieldPercent(0, 0)).toBeNull();
    expect(calculateYieldPercent(12, -1)).toBeNull();
    expect(calculateYieldPercent(Number.NaN, 10)).toBeNull();
  });
});
