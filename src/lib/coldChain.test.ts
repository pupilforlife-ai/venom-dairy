import { describe, expect, it } from 'vitest';
import { isRawMilkTemperatureInRange } from './coldChain';

describe('raw milk cold-chain limits', () => {
  it('accepts the inclusive 2°C to 6°C range', () => {
    expect(isRawMilkTemperatureInRange(2)).toBe(true);
    expect(isRawMilkTemperatureInRange(4)).toBe(true);
    expect(isRawMilkTemperatureInRange(6)).toBe(true);
  });

  it('rejects readings below or above the range and non-finite values', () => {
    expect(isRawMilkTemperatureInRange(1.9)).toBe(false);
    expect(isRawMilkTemperatureInRange(6.1)).toBe(false);
    expect(isRawMilkTemperatureInRange(Number.NaN)).toBe(false);
  });
});
