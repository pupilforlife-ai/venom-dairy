import { describe, expect, it } from 'vitest';
import { calculateButterBlendRecipe } from './butterBlendRecipe';

describe('calculateButterBlendRecipe', () => {
  it('calculates one salted standard round including all added mass', () => {
    expect(calculateButterBlendRecipe(16.5, true)).toEqual({
      fullRounds: 1,
      partialButterKg: 0,
      butterKg: 16.5,
      replacerKg: 5,
      saltKg: 0.145,
      outputKg: 21.645,
    });
  });

  it('scales partial salted rounds proportionally', () => {
    expect(calculateButterBlendRecipe(6, true)).toEqual({
      fullRounds: 0,
      partialButterKg: 6,
      butterKg: 6,
      replacerKg: 1.82,
      saltKg: 0.053,
      outputKg: 7.873,
    });
  });

  it('adds replacer but no salt for unsalted PUBBB', () => {
    expect(calculateButterBlendRecipe(33, false)).toEqual({
      fullRounds: 2,
      partialButterKg: 0,
      butterKg: 33,
      replacerKg: 10,
      saltKg: 0,
      outputKg: 43,
    });
  });
});
