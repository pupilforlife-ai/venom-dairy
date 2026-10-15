import { describe, expect, it } from 'vitest';
import { parseAdditiveQuantity } from './additiveQuantity';

describe('parseAdditiveQuantity', () => {
  it('accepts a single weight or adds multiple container weights', () => {
    expect(parseAdditiveQuantity('25')).toBe(25);
    expect(parseAdditiveQuantity('12+13')).toBe(25);
    expect(parseAdditiveQuantity(' 12.5 + 13.25 + 0.25 ')).toBe(26);
  });

  it('rejects incomplete or non-numeric expressions', () => {
    expect(parseAdditiveQuantity('')).toBeNull();
    expect(parseAdditiveQuantity('12+')).toBeNull();
    expect(parseAdditiveQuantity('12+abc')).toBeNull();
    expect(parseAdditiveQuantity('12*13')).toBeNull();
  });
});
