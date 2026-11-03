import { describe, expect, it } from 'vitest';
import { mergePersistedValue } from './useSupabaseState';

describe('merge persisted state regression checks', () => {
  it('keeps unrelated new server records and merges independent fields', () => {
    const base = [{ id: 'one', cases: 2, temperature: 5 }];
    expect(mergePersistedValue(base, [{ ...base[0], cases: 3 }], [{ ...base[0], temperature: 4 }, { id: 'two', cases: 1, temperature: 6 }]))
      .toEqual([{ id: 'one', cases: 3, temperature: 4 }, { id: 'two', cases: 1, temperature: 6 }]);
  });
  it('preserves changed remote records from stale deletion, and honors unchanged deletion', () => {
    const base = [{ id: 'one', cases: 2 }];
    expect(mergePersistedValue(base, [], [{ id: 'one', cases: 3 }])).toEqual([{ id: 'one', cases: 3 }]);
    expect(mergePersistedValue(base, [], base)).toEqual([]);
  });
  it('preserves local additions, field removals and newer remote-only nested values', () => {
    const base: { id: string; props: Record<string, number> } = { id: 'one', props: { a: 1, b: 2 } };
    expect(mergePersistedValue(base, { id: 'one', props: { a: 3 } }, { id: 'one', props: { a: 1, b: 2, c: 4 } }))
      .toEqual({ id: 'one', props: { a: 3, c: 4 } });
    expect(mergePersistedValue([], [{ id: 'new' }], [])).toEqual([{ id: 'new' }]);
  });
});
