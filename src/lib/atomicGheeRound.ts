import type { SupabaseClient } from '@supabase/supabase-js';
import type { MilkLot, ProductionRound } from '../data/mockData';

export interface GheeRoundRequest {
  operationId: string;
  roundDate: string;
  butterSource: string;
  butterInput: number;
  team: string;
}

export async function persistGheeRound(client: Pick<SupabaseClient, 'rpc'>, request: GheeRoundRequest) {
  if (!Number.isFinite(request.butterInput) || request.butterInput <= 0) throw new Error('Enter a finite positive butter input');
  const { data, error } = await client.rpc('create_ghee_round', { request });
  if (error) throw new Error(`Ghee round was not confirmed. ${error.message} Retry this same form safely.`);
  if (!data?.round?.id || !Array.isArray(data.sourceRounds)) throw new Error('The server did not confirm the ghee save. Retry this same form safely.');
  return data as { round: ProductionRound; sourceRounds: ProductionRound[]; milkLot: MilkLot | null; replayed: boolean };
}
