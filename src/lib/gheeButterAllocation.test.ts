import { describe, expect, it } from 'vitest';
import { allocateGheeButter } from './gheeButterAllocation';

describe('allocateGheeButter', () => {
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
