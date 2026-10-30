import { describe, expect, it, vi } from 'vitest';
import { persistGheeRound, GheeRoundRequest } from './atomicGheeRound';

const request: GheeRoundRequest = { operationId: 'retry-one', roundDate: '2026-10-30', butterSource: 'milk:test', butterInput: 92.5, team: 'Team' };
describe('confirmed ghee transaction', () => {
  it.each([NaN, Infinity, -Infinity, 0, -1])('rejects invalid input %s before contacting the server', async butterInput => {
    const rpc = vi.fn();
    await expect(persistGheeRound({ rpc } as never, { ...request, butterInput })).rejects.toThrow('finite positive');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('uses one server transaction and waits for confirmation', async () => {
    let finish!: (value: unknown) => void;
    const rpc = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    let confirmed = false;
    const pending = persistGheeRound({ rpc } as never, request).then(value => { confirmed = true; return value; });
    await Promise.resolve();
    expect(confirmed).toBe(false);
    finish({ data: { round: { id: 'ghee-one' }, sourceRounds: [], milkLot: null }, error: null });
    expect((await pending).round.id).toBe('ghee-one');
    expect(rpc).toHaveBeenCalledExactlyOnceWith('create_ghee_round', { request });
  });
  it('surfaces server rejection, and retries the same operation identity', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: { message: 'Pool update rejected' } })
      .mockResolvedValueOnce({ data: { round: { id: 'ghee-one' }, sourceRounds: [], replayed: true }, error: null });
    await expect(persistGheeRound({ rpc } as never, request)).rejects.toThrow('was not confirmed');
    expect((await persistGheeRound({ rpc } as never, request)).replayed).toBe(true);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  });
});
