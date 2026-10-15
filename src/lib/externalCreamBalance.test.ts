import { describe, expect, it } from 'vitest';
import { normalizeExternalCreamBalance } from './externalCreamBalance';

describe('normalizeExternalCreamBalance', () => {
  it('reconstructs a missing balance from receipt quantity and linked butter rounds', () => {
    const lot = {
      id: 'cream-1',
      quantity: 200,
      consumed: null,
      remaining: null,
    };
    const rounds = [
      { type: 'Butter', creamSource: 'external', creamLotId: 'cream-1', actualInput: 58.95 },
      { type: 'Butter', creamSource: 'external', creamLotId: 'another-lot', actualInput: 12 },
      { type: 'Ghee', creamSource: 'external', creamLotId: 'cream-1', actualInput: 10 },
    ];

    expect(normalizeExternalCreamBalance(lot, rounds)).toEqual({
      ...lot,
      consumed: 58.95,
      remaining: 141.05,
    });
  });

  it('preserves already-saved numeric balances', () => {
    const lot = { id: 'cream-1', quantity: 200, consumed: 25, remaining: 175 };
    expect(normalizeExternalCreamBalance(lot, [])).toBe(lot);
  });

  it('preserves a negative balance so recorded overdraw remains visible', () => {
    const lot = { id: 'cream-1', quantity: 200, consumed: null, remaining: null };
    const rounds = [
      { type: 'Butter', creamSource: 'external', creamLotId: 'cream-1', actualInput: 205 },
    ];
    expect(normalizeExternalCreamBalance(lot, rounds)).toMatchObject({
      consumed: 205,
      remaining: -5,
    });
  });
});
