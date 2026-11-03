import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProductionRound } from '../data/mockData';

export type ButterLossReason = 'moisture_loss' | 'handling_loss' | 'other';
export interface ButterLossRequest {
  operationId: string;
  poolId: string;
  quantityKg: number;
  expectedBalanceKg: number;
  reason: ButterLossReason;
  note: string;
}
export interface ButterLossRecord extends ButterLossRequest {
  batchCode: string;
  poolSku: string;
  recordedAt: string;
  recordedBy: string;
  recordedById?: string;
  balanceAfterKg: number;
  allocations: Array<{ roundId: string; quantityKg: number; balanceBeforeKg: number; balanceAfterKg: number }>;
}
export const butterLossReasonLabels: Record<ButterLossReason, string> = {
  moisture_loss: 'Confirmed moisture loss', handling_loss: 'Handling / packing loss', other: 'Other confirmed loss',
};
export const canRecordButterLoss = (role: string) => ['owner', 'admin'].includes(role.toLowerCase());
export const butterLossPoolId = (round: ProductionRound) => round.blendedPoolId || `blended:${round.id}`;
export function butterLossRecords(rounds: ProductionRound[]) {
  return [...new Map(rounds.flatMap(round => Object.values(round.butterLossHistory || {})).map(loss => [loss.operationId, loss])).values()]
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
}
export function validateButterLoss(request: ButterLossRequest) {
  if (!request.operationId || !request.poolId) throw new Error('Reopen the butter loss form.');
  if (!Number.isFinite(request.quantityKg) || request.quantityKg < 0.001) throw new Error('Enter a loss weight of at least 0.001 kg.');
  if (!Number.isFinite(request.expectedBalanceKg) || request.expectedBalanceKg + 0.000001 < request.quantityKg) throw new Error('Loss cannot exceed the available butter balance.');
  if (!Object.prototype.hasOwnProperty.call(butterLossReasonLabels, request.reason)) throw new Error('Select a loss reason.');
  if (request.note.trim().length < 5) throw new Error('Explain the confirmed loss (at least 5 characters).');
}
/** Browser-only simulation; production always uses the permission-checked RPC. */
export function prepareLocalButterLoss(rounds: ProductionRound[], request: ButterLossRequest, role: string, actor: string, at: string) {
  if (!canRecordButterLoss(role)) throw new Error('Only Owner and Admin can record butter losses.');
  validateButterLoss(request);
  const previous = butterLossRecords(rounds).find(loss => loss.operationId === request.operationId);
  if (previous) {
    if (previous.poolId !== request.poolId || previous.quantityKg !== request.quantityKg || previous.reason !== request.reason || previous.note !== request.note.trim()) throw new Error('Loss operation ID already used for a different entry.');
    return { rounds, loss: previous };
  }
  const sources = rounds.filter(round => round.type === 'Butter' && butterLossPoolId(round) === request.poolId
    && (Boolean(round.blendedPoolId) || ['pubbb_pool', 'psbbb_pool', 'bb05_pool'].includes(round.status)));
  if (!sources.length) throw new Error('This blended butter pool is unavailable. Refresh the board.');
  if (sources.some(round => !Number.isFinite(round.remainingBalance) || round.remainingBalance! < 0)) throw new Error('The source butter balance needs review.');
  const available = Math.round(sources.reduce((total, round) => total + round.remainingBalance!, 0) * 1e6) / 1e6;
  if (Math.abs(available - request.expectedBalanceKg) > 0.000001) throw new Error('Butter balance changed. Reopen and verify the loss before saving.');
  let remaining = request.quantityKg;
  const allocations: ButterLossRecord['allocations'] = [];
  for (const round of sources) {
    const quantityKg = Math.min(Math.round(round.remainingBalance! * 1e6) / 1e6, remaining);
    if (quantityKg > 0) allocations.push({ roundId: round.id, quantityKg, balanceBeforeKg: round.remainingBalance!, balanceAfterKg: Math.max(0, Math.round((round.remainingBalance! - quantityKg) * 1e6) / 1e6) });
    remaining = Math.round((remaining - quantityKg) * 1e6) / 1e6;
  }
  const loss: ButterLossRecord = { ...request, note: request.note.trim(), batchCode: sources[0].batchCode || request.poolId,
    poolSku: sources[0].pool || 'PUBBB', recordedBy: actor, recordedAt: at, balanceAfterKg: Math.round((available - request.quantityKg) * 1e6) / 1e6, allocations };
  return { loss, rounds: rounds.map(round => {
    const allocation = allocations.find(item => item.roundId === round.id);
    return allocation ? { ...round, remainingBalance: allocation.balanceAfterKg, butterLossHistory: { ...round.butterLossHistory, [request.operationId]: loss } } : round;
  }) };
}
export async function persistButterLoss(client: Pick<SupabaseClient, 'rpc'>, request: ButterLossRequest) {
  validateButterLoss(request);
  const { data, error } = await client.rpc('record_butter_pool_loss', { request });
  if (error) throw new Error(`Butter loss was not confirmed. ${error.message} Retry this same form safely.`);
  if (!data?.loss?.operationId || data.loss.operationId !== request.operationId || !Array.isArray(data.rounds)) throw new Error('The server did not confirm this loss. Retry this same form safely.');
  return data as { loss: ButterLossRecord; rounds: ProductionRound[] };
}
