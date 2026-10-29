import { describe, expect, it, vi } from 'vitest';
import { persistPaneerPacking, PaneerPackingRequest } from './atomicPaneerPacking';

const request: PaneerPackingRequest = { operationId: 'same-safe-retry', roundId: 'r1', packIndex: null,
  expectedPack: null, sku: 'RPAN100', cases: 3, loose: 0, caseWeightKg: 0, looseWeightKg: 0, weightKg: 0, reason: '' };

describe('confirmed atomic paneer packing', () => {
  it('uses one RPC for both records, retaining the retry identity', async () => {
    const response = { round: { id: 'r1', remainingBalance: 25.097 }, stock: { id: 'existing-stock' }, replayed: false };
    const rpc = vi.fn().mockResolvedValue({ data: response, error: null });
    const pending = persistPaneerPacking({ rpc } as never, request);
    expect(await pending).toEqual(response);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('commit_paneer_packing', { request });
  });
  it('does not report success before the server confirms the transaction', async () => {
    let resolve!: (value: unknown) => void;
    const rpc = vi.fn(() => new Promise(done => { resolve = done; }));
    let confirmed = false;
    const pending = persistPaneerPacking({ rpc } as never, request).then(() => { confirmed = true; });
    await Promise.resolve();
    expect(confirmed).toBe(false);
    resolve({ data: { round: { id: 'r1' }, stock: null, replayed: false }, error: null });
    await pending;
    expect(confirmed).toBe(true);
  });
  it('surfaces a rejected save instead of leaving a false-success message', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'Concurrent correction; review first' } });
    await expect(persistPaneerPacking({ rpc } as never, request)).rejects.toThrow('Packing was not confirmed. Concurrent correction');
  });
  it('rejects missing confirmation and reuses the same identity on a retry', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { round: { id: 'r1' }, stock: { id: 'same-stock' }, replayed: true }, error: null });
    await expect(persistPaneerPacking({ rpc } as never, request)).rejects.toThrow('did not confirm');
    expect((await persistPaneerPacking({ rpc } as never, request)).replayed).toBe(true);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  });
});
