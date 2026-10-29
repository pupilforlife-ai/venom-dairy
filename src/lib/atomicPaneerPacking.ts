import type { SupabaseClient } from '@supabase/supabase-js';
import type { FinishedStockLot, ProductionPackedSku, ProductionRound } from '../data/mockData';

export interface PaneerPackingRequest {
  operationId: string;
  roundId: string;
  packIndex: number | null;
  expectedPack: ProductionPackedSku | null;
  sku: string;
  cases: number;
  loose: number;
  caseWeightKg: number;
  looseWeightKg: number;
  weightKg: number;
  reason: string;
}

export async function persistPaneerPacking(client: Pick<SupabaseClient, 'rpc'>, request: PaneerPackingRequest) {
  const { data, error } = await client.rpc('commit_paneer_packing', { request });
  if (error) throw new Error(`Packing was not confirmed. ${error.message} Keep this form open and retry; do not record the same cases again elsewhere.`);
  if (!data?.round?.id) throw new Error('The server did not confirm packing. Retry this same form safely.');
  return data as { round: ProductionRound; stock: FinishedStockLot | null; replayed: boolean };
}
