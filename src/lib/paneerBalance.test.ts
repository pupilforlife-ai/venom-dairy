import { describe, expect, it } from 'vitest';
import { calculatePaneerRemainingBalance, getPaneerRoundRemainingBalance } from './paneerBalance';

describe('calculatePaneerRemainingBalance', () => {
  it('uses corrected block output when no packing or SPP has been recorded', () => {
    expect(calculatePaneerRemainingBalance(84.168)).toBeCloseTo(84.168, 6);
  });

  it('subtracts all packed SKU weight from corrected output, not a stale saved balance', () => {
    const packs = [{ sku: 'MPAN200', cases: 13, loose: 0 }];
    expect(calculatePaneerRemainingBalance(68.494, 0, packs)).toBeCloseTo(6.094, 6);
  });

  it('subtracts both SPP usage and packing from the corrected block output', () => {
    const packs = [{ sku: 'MPAN200', cases: 2, loose: 0 }];
    expect(calculatePaneerRemainingBalance(80, 10, packs)).toBeCloseTo(60.4, 6);
  });

  it('preserves an overdraw as a negative balance instead of hiding it', () => {
    expect(calculatePaneerRemainingBalance(20, 0, [{ sku: 'MPAN200', cases: 5, loose: 0 }]))
      .toBeCloseTo(-4, 6);
  });

  it('ignores a stale saved balance when reading a paneer round', () => {
    expect(getPaneerRoundRemainingBalance({
      type: 'C/S',
      outputWeight: 84.168,
      remainingBalance: 12087.153,
    })).toBeCloseTo(84.168, 6);
  });
});
