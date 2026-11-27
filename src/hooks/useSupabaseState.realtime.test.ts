// @ts-nocheck -- isolated fake browser and Supabase channel for the hook.
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import renderer, { act } from 'react-test-renderer';

const realtime = vi.hoisted(() => ({ callback: null, row: null, reads: 0 }));
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            realtime.reads += 1;
            return { data: realtime.row, error: null };
          },
        }),
      }),
    }),
    channel: () => ({
      on: (_event, _filter, callback) => { realtime.callback = callback; return {
        subscribe: () => ({}),
      }; },
    }),
    removeChannel: async () => undefined,
  },
}));

import { isCompleteAppStateRow, useSupabaseState } from './useSupabaseState';

describe('incomplete realtime app state', () => {
  it('rejects a change notification without its large JSON value', () => {
    expect(isCompleteAppStateRow({ key: 'rounds', version: 2 }, 'rounds', [])).toBe(false);
    expect(isCompleteAppStateRow({ key: 'rounds', version: 2, value: null }, 'rounds', [])).toBe(false);
    expect(isCompleteAppStateRow({ key: 'rounds', version: 2, value: [] }, 'rounds', [])).toBe(true);
  });

  it('retains rounds during a partial event and reads the complete latest row', async () => {
    const cached = new Map();
    globalThis.window = {
      localStorage: {
        getItem: key => cached.get(key) ?? null,
        setItem: (key, value) => cached.set(key, value),
      },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
    realtime.reads = 0;
    realtime.row = { key: 'rounds', value: [{ id: 'R1' }], version: 1 };
    function Board() {
      const [rounds] = useSupabaseState('rounds', []);
      return React.createElement('span', null, rounds.map(round => round.id).join(','));
    }
    let view;
    await act(async () => { view = renderer.create(React.createElement(Board)); });
    expect(view.toJSON().children).toEqual(['R1']);

    realtime.row = { key: 'rounds', value: [{ id: 'R1' }, { id: 'R2' }], version: 2 };
    await act(async () => {
      realtime.callback({ new: { key: 'rounds', version: 2 } });
    });
    expect(view.toJSON().children).toEqual(['R1,R2']);
    expect(realtime.reads).toBe(2);
    expect(JSON.parse(cached.get('rounds'))).toEqual([{ id: 'R1' }, { id: 'R2' }]);
    await act(async () => { view.unmount(); });
    delete globalThis.window;
  });
});
