import { describe, expect, it } from 'vitest';
import { allocateGheeButter, getGheeAvailableButter, getGheeButterSources } from './gheeButterAllocation';

describe('allocateGheeButter', () => {
  it.each([NaN, Infinity, -Infinity, -1, 0])('rejects invalid butter input %s without touching source records', input => {
    const source = Object.freeze([{ id: 'source', remainingBalance: 287.7 }]);
    expect(() => allocateGheeButter(input, [...source])).toThrow('finite positive');
    expect(source[0].remainingBalance).toBe(287.7);
  });
  it('never spreads invalid legacy source balances into good records', () => {
    expect(allocateGheeButter(92.5, [{ id: 'bad', remainingBalance: NaN }, { id: 'good', remainingBalance: 100 }]))
      .toEqual({ allocations: [{ id: 'good', quantityKg: 92.5 }], recordedFromSourceKg: 92.5, overdrawKg: 0 });
  });
  it('shows the recovered 102.7 kg without mixing other lots, external cream or blends', () => {
    const source = { type: 'Butter', status: 'churned', milkLotId: '261026', creamSource: 'internal', butterOutput: 40 };
    const rounds = [
      ...[0, 0, 0, 0, 0, 1.9, 26.5, 38.2, 36.1].map((remainingBalance, i) => ({ ...source, id: `r${i}`, remainingBalance })),
      { ...source, id: 'other-lot', milkLotId: 'other', remainingBalance: 999 },
      { ...source, id: 'blend', blendedPoolId: 'blend', remainingBalance: 999 },
      { ...source, id: 'external', creamSource: 'external', creamLotId: 'external-cream', remainingBalance: 999 },
    ];
    expect(getGheeAvailableButter(rounds, 'milk:261026')).toBeCloseTo(102.7, 6);
    expect(getGheeButterSources(rounds, 'milk:261026')).toHaveLength(9);
    expect(getGheeAvailableButter(rounds, 'cream:external-cream')).toBe(999);
  });
  it('records production above the app balance and reports the discrepancy', () => {
    const result = allocateGheeButter(84, [
      { id: 'older', remainingBalance: 30 },
      { id: 'newer', remainingBalance: 51.25 },
    ]);

    expect(result).toEqual({
      allocations: [
        { id: 'older', quantityKg: 30 },
        { id: 'newer', quantityKg: 51.25 },
      ],
      recordedFromSourceKg: 81.25,
      overdrawKg: 2.75,
    });
  });

  it('does not create a shortage when source stock covers the input', () => {
    expect(allocateGheeButter(40, [{ id: 'source', remainingBalance: 50 }])).toEqual({
      allocations: [{ id: 'source', quantityKg: 40 }],
      recordedFromSourceKg: 40,
      overdrawKg: 0,
    });
  });

  it('treats empty source balances as a recorded overdraw instead of a blocker', () => {
    expect(allocateGheeButter(5, [])).toEqual({
      allocations: [],
      recordedFromSourceKg: 0,
      overdrawKg: 5,
    });
  });
});
