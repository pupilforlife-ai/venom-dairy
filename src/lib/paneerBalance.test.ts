import { describe, expect, it } from 'vitest';
import {
  calculatePaneerRemainingBalance,
  getPaneerRoundRemainingBalance,
  isPaneerIntermediateLot,
  reconcileFrozenRoundBalances,
} from './paneerBalance';

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

describe('cloth tare in paneer packing', () => {
  it('deducts recorded cloth once for the reported lot 171126 examples', () => {
    expect(calculatePaneerRemainingBalance(72, 0, [{sku:'RPAN100',cases:4,loose:12}], 1.789)).toBe(-1.789);
    expect(calculatePaneerRemainingBalance(72, 0, [{sku:'RPAN100',cases:60,loose:0}], 2.987)).toBe(-830.987);
  });
  it('uses current source cloth and packing rather than stale balance and leaves sources intact', () => {
    const source={type:'D',outputWeight:80,remainingBalance:999,sppRecordedWeight:5,
      paneerCuttingDetails:{clothKg:2},packedSkus:[{sku:'MPAN100',cases:2,loose:0},{sku:'PAN111',cases:0,loose:0,weightKg:3}]};
    const before=JSON.stringify(source);
    expect(getPaneerRoundRemainingBalance(source)).toBe(40);
    expect(JSON.stringify(source)).toBe(before);
    expect(getPaneerRoundRemainingBalance({...source,paneerCuttingDetails:{clothKg:1}})).toBe(41);
    expect(getPaneerRoundRemainingBalance({...source,packedSkus:source.packedSkus.slice(1)})).toBe(70);
  });
  it('preserves legacy/no-cloth and non-paneer behavior', () => {
    for(const details of [undefined,{clothKg:null},{clothKg:0}])expect(getPaneerRoundRemainingBalance({type:'D',outputWeight:72,remainingBalance:72,paneerCuttingDetails:details})).toBe(72);
    expect(getPaneerRoundRemainingBalance({type:'D',outputWeight:72,paneerCuttingDetails:{clothKg:2}})).toBe(70);
    expect(getPaneerRoundRemainingBalance({type:'Butter',outputWeight:30,remainingBalance:12,paneerCuttingDetails:{clothKg:2}})).toBe(12);
  });
});

describe('reconcileFrozenRoundBalances', () => {
  it('subtracts overpacked round stock from positive frozen balances', () => {
    expect(reconcileFrozenRoundBalances([30, -5])).toEqual({
      positiveBalanceKg: 30,
      overpackedKg: 5,
      netBalanceKg: 25,
    });
  });

  it('does not report negative stock when overpacking exceeds the positive pool', () => {
    expect(reconcileFrozenRoundBalances([10, -14])).toEqual({
      positiveBalanceKg: 10,
      overpackedKg: 14,
      netBalanceKg: 0,
    });
  });

  it('handles empty, zero, and non-finite balances safely', () => {
    expect(reconcileFrozenRoundBalances([]).netBalanceKg).toBe(0);
    expect(reconcileFrozenRoundBalances([0, Number.NaN, Number.POSITIVE_INFINITY])).toEqual({
      positiveBalanceKg: 0,
      overpackedKg: 0,
      netBalanceKg: 0,
    });
  });
});

describe('isPaneerIntermediateLot', () => {
  it('recognizes paneer stock but not cream sourced from the same round', () => {
    expect(isPaneerIntermediateLot({ productId: 'paneer-c/s-cut', productName: 'Rozana Paneer (Cut)' })).toBe(true);
    expect(isPaneerIntermediateLot({ productId: 'pan111', productName: 'PAN111 (Recovered Paneer)' })).toBe(true);
    expect(isPaneerIntermediateLot({ productId: 'cream-recovered', productName: 'Recovered Cream (from C/S)' })).toBe(false);
  });
});
