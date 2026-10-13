import { describe, expect, it } from 'vitest';
import { comparePaneerBlockToPackedWeight } from './paneerWeightReconciliation';

describe('comparePaneerBlockToPackedWeight', () => {
  it('subtracts PAN111 before comparing the packed weight', () => {
    expect(comparePaneerBlockToPackedWeight(100, 12.5, 80)).toEqual({
      blockWeightKg: 100,
      pan111Kg: 12.5,
      packableWeightKg: 87.5,
      packedWeightKg: 80,
      differenceKg: 7.5,
    });
  });

  it('keeps an over-packed result visible instead of clamping it to zero', () => {
    expect(comparePaneerBlockToPackedWeight(50, 5, 50).differenceKg).toBe(-5);
  });

  it('rounds display values to two decimals', () => {
    expect(comparePaneerBlockToPackedWeight(10.005, 1.001, 8.001).differenceKg).toBe(1);
  });
});

