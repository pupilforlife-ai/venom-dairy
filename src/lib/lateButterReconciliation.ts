import type { SupabaseClient } from '@supabase/supabase-js';
import type { MilkLot, ProductionRound } from '../data/mockData';
import { getGheeButterSources } from './gheeButterAllocation';

export interface ButterSettlement {
  id: string;
  recordedAt: string;
  recordedBy: string;
  sourceKey: string;
  matchedKg: number;
  pendingBeforeKg: number;
  pendingAfterKg: number;
  allocations: Array<{ id: string; quantityKg: number }>;
}
export const gheeButterSourceKey = (round: ProductionRound) => round.sourceCreamLotId
  ? `cream:${round.sourceCreamLotId}` : `milk:${round.milkLotId}`;
export function getPendingGheeButter(rounds: ProductionRound[], source: string) {
  return Math.round(rounds.filter(round => round.type === 'Ghee' && gheeButterSourceKey(round) === source)
    .reduce((sum, round) => sum + (Number.isFinite(round.butterOverdrawKg) ? Math.max(0, round.butterOverdrawKg || 0) : 0), 0) * 1e6) / 1e6;
}
/** Synthetic/browser-only equivalent of the server's FIFO transition. */
export function settleLateButter(rounds: ProductionRound[], source: string, eventId: string, actor: string, at: string) {
  if (!source.startsWith('milk:') || !source.slice(5)) return rounds; // External cream requires explicit use, never automatic settlement.
  const updated = new Map(rounds.map(round => [round.id, round]));
  const sources = getGheeButterSources(rounds, source).slice().sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id));
  const claims = rounds.filter(round => round.type === 'Ghee' && gheeButterSourceKey(round) === source && (round.butterOverdrawKg || 0) > 0)
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id));
  for (const claim of claims) {
    if (claim.butterSettlementHistory?.[`${eventId}:${claim.id}`]) continue;
    const pending = claim.butterOverdrawKg!;
    const allocated = (claim.butterSourceAllocations || []).reduce((sum, row) => sum + row.quantityKg, 0);
    if (!Number.isFinite(claim.butterInput) || Math.abs(claim.butterInput! - allocated - pending) > 0.000001) throw new Error('Ghee input and outstanding allocation need review.');
    let need = pending;
    const allocations: ButterSettlement['allocations'] = [];
    for (const sourceRound of sources) {
      const current = updated.get(sourceRound.id)!;
      if (!Number.isFinite(current.remainingBalance)) continue;
      const quantityKg = Math.min(Math.max(0, current.remainingBalance!), need);
      if (quantityKg <= 0) continue;
      allocations.push({ id: current.id, quantityKg });
      updated.set(current.id, { ...current, remainingBalance: Math.max(0, Math.round((current.remainingBalance! - quantityKg) * 1e6) / 1e6),
        usedInGhee: Math.round(((current.usedInGhee || 0) + quantityKg) * 1e6) / 1e6, destination: 'ghee' });
      need = Math.max(0, Math.round((need - quantityKg) * 1e6) / 1e6);
      if (need === 0) break;
    }
    if (!allocations.length) continue;
    const receipt: ButterSettlement = { id: `${eventId}:${claim.id}`, sourceKey: source, recordedAt: at, recordedBy: actor,
      matchedKg: Math.round((pending - need) * 1e6) / 1e6, pendingBeforeKg: pending, pendingAfterKg: need, allocations };
    updated.set(claim.id, { ...claim, butterOverdrawKg: need, butterOriginalOverdrawKg: claim.butterOriginalOverdrawKg ?? pending,
      butterSourceAllocations: [...(claim.butterSourceAllocations || []), ...allocations],
      butterSettlementHistory: { ...claim.butterSettlementHistory, [receipt.id]: receipt } });
    for (const allocation of allocations) {
      const current = updated.get(allocation.id)!;
      updated.set(current.id, { ...current, butterSettlementHistory: { ...current.butterSettlementHistory, [receipt.id]: receipt } });
    }
  }
  return rounds.map(round => updated.get(round.id)!);
}
export interface ButterOutputRequest { operationId: string; roundId: string; butterOutput: number; buttermilkOutput: number }
export async function persistButterOutput(client: Pick<SupabaseClient, 'rpc'>, request: ButterOutputRequest) {
  if (!Number.isFinite(request.butterOutput) || request.butterOutput <= 0 || !Number.isFinite(request.buttermilkOutput) || request.buttermilkOutput < 0) throw new Error('Enter valid butter and buttermilk outputs.');
  const { data, error } = await client.rpc('record_butter_output', { request });
  if (error) throw new Error(`Butter output was not confirmed. ${error.message} Retry this same form safely.`);
  if (!data?.round?.id || data.round.id !== request.roundId || !Array.isArray(data.changedRounds)) throw new Error('The server did not confirm this output. Retry the same form safely.');
  return data as { round: ProductionRound; changedRounds: ProductionRound[]; milkLot: MilkLot | null; matchedKg: number };
}
