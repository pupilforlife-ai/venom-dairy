import type { CrumbingBatch } from '../pages/CrumbingTab';
import type { HalloumiPool } from '../data/mockData';

export type HcpBalanceDisposition = '' | 'HAL111' | 'disposed' | 'chiller';

export interface HcpCrumbingForm {
  traysCrumbed: number;
  crumbedBy: string;
  predustMultiplier: number;
  batterMultiplier: number;
  breadingMultiplier: number;
  balanceWeightKg: number;
  balanceRecorded: boolean;
  wastageKg: number;
  balanceDisposition: HcpBalanceDisposition;
}

export function initialHcpCrumbingState() {
  return { hcpRecipeRequired: true, status: 'crumbing' as const, traysCrumbed: 0, traysRemaining: 0,
    traysFried: 0, traysPacked: 0, hcpCrumbingDraft: { traysCrumbed: 0 } };
}

export function getHcpCrumbingForm(batch: CrumbingBatch): HcpCrumbingForm {
  return {
    // Preserve an unfinished pre-change tray count; never reset legacy records.
    traysCrumbed: batch.hcpCrumbingDraft?.traysCrumbed ?? batch.traysCrumbed ?? 0,
    crumbedBy: batch.crumbingTeam || '',
    predustMultiplier: batch.recipe?.flavourMultiplier || 0,
    batterMultiplier: batch.recipe?.batterMultiplier || 0,
    breadingMultiplier: batch.recipe?.breadingMultiplier || 0,
    balanceWeightKg: batch.hcpCrumbingDraft?.balanceWeightKg ?? batch.balanceWeightKg ?? 0,
    balanceRecorded: batch.hcpCrumbingDraft?.balanceRecorded ?? batch.balanceWeightKg !== undefined,
    wastageKg: batch.hcpCrumbingDraft?.wastageKg ?? batch.wastageKg ?? 0,
    balanceDisposition: batch.hcpCrumbingDraft?.balanceDisposition ?? batch.hcpBalanceDisposition ?? '',
  };
}

export function hcpRecipeReady(form: HcpCrumbingForm) {
  return [form.predustMultiplier, form.batterMultiplier, form.breadingMultiplier].every(value => Number.isFinite(value) && value > 0);
}

function recipe(form: HcpCrumbingForm) {
  return {
    flavourMultiplier: form.predustMultiplier, batterMultiplier: form.batterMultiplier, breadingMultiplier: form.breadingMultiplier,
    flavourIyababKg: 0, flavourPredustKg: form.predustMultiplier, batterIyababaKg: form.batterMultiplier,
    batterWaterL: form.batterMultiplier * 2.5, breadingAdajioKg: form.breadingMultiplier,
  };
}

function requireOpenHcpBatch(batch: CrumbingBatch) {
  if (batch.type !== 'HCP' || batch.status !== 'crumbing' || batch.productionCompletedAt) throw new Error('Only an unfinished HCP crumbing batch can be updated here.');
}

export function buildHcpDraftUpdates(batch: CrumbingBatch, form: HcpCrumbingForm, now: string): Partial<CrumbingBatch> {
  requireOpenHcpBatch(batch);
  if (![form.traysCrumbed, form.predustMultiplier, form.batterMultiplier, form.breadingMultiplier, form.balanceWeightKg, form.wastageKg].every(value => Number.isFinite(value) && value >= 0)) throw new Error('Enter valid non-negative tray, ingredient, balance and wastage quantities.');
  return {
    hcpCrumbingDraft: { traysCrumbed: form.traysCrumbed, balanceWeightKg: form.balanceWeightKg,
      balanceRecorded: form.balanceRecorded, wastageKg: form.wastageKg, balanceDisposition: form.balanceDisposition }, crumbingTeam: form.crumbedBy,
    recipe: recipe(form), recipeAutosavedAt: now,
    // Do not publish traysCrumbed/traysRemaining or complete/freeze the batch.
  };
}

export function buildHcpCompletionUpdates(batch: CrumbingBatch, form: HcpCrumbingForm, now: string, recordedBy: string): Partial<CrumbingBatch> {
  requireOpenHcpBatch(batch);
  buildHcpDraftUpdates(batch, form, now);
  if (!Number.isInteger(form.traysCrumbed) || form.traysCrumbed <= 0 || !form.crumbedBy.trim()) throw new Error('Enter the final HCP crumbed tray count and responsible staff.');
  if (!hcpRecipeReady(form)) throw new Error('Record at least one addition for Predust, batter, and Adajio.');
  if (form.traysCrumbed < batch.traysFried) throw new Error('The final tray count cannot be below trays already fried.');
  if (!form.balanceRecorded) throw new Error('Record the weighed Halloumi balance, including 0 if none remains.');
  const sourceWeightKg = batch.sourceWeightKg;
  if (!Number.isFinite(sourceWeightKg) || !sourceWeightKg || sourceWeightKg <= 0) throw new Error('The source Halloumi weight is missing; review the batch source before completing.');
  const weightCrumbedKg = Math.round((sourceWeightKg - form.balanceWeightKg - form.wastageKg) * 1e6) / 1e6;
  if (weightCrumbedKg < 0) throw new Error('Balance plus wastage cannot exceed the Halloumi issued to this batch.');
  if (form.balanceWeightKg > 0 && !['HAL111', 'disposed', 'chiller'].includes(form.balanceDisposition)) throw new Error('Select whether the Halloumi balance went to HAL111, was disposed of, or was stored in the chiller.');
  return {
    status: 'crumbing', traysCrumbed: form.traysCrumbed, traysRemaining: form.traysCrumbed - batch.traysFried,
    crumbingTeam: form.crumbedBy.trim(), recipe: recipe(form), hcpCrumbingDraft: null,
    recipeRecordedAt: now, recipeAutosavedAt: now, productionCompletedAt: now,
    balanceWeightKg: form.balanceWeightKg, wastageKg: form.wastageKg,
    weightCrumbedKg: Math.max(0, weightCrumbedKg),
    hcpBalanceDisposition: form.balanceWeightKg > 0 ? form.balanceDisposition : '',
    balanceRecordedAt: now, hcpCompletedBy: recordedBy,
  };
}

// Each completed HCP batch can return its unused Halloumi exactly once.
// Keep the receipt on the pool so a retry cannot credit the balance twice.
export function returnHcpBalanceToPool(pool: HalloumiPool, batch: CrumbingBatch): HalloumiPool {
  if (batch.type !== 'HCP' || !batch.productionCompletedAt || batch.hcpBalanceDisposition !== 'chiller'
    || batch.sourceBatchId !== pool.milkLotId || !Number.isFinite(batch.balanceWeightKg) || !(batch.balanceWeightKg! > 0)) return pool;
  if (pool.hcpChillerReturns?.[batch.id]) return pool;
  const weightKg = batch.balanceWeightKg!;
  return {
    ...pool,
    // Persist a receipt, not an increment of shared counters. Independent
    // returns can then merge without one stale snapshot losing another return.
    hcpChillerReturns: { ...pool.hcpChillerReturns, [batch.id]: {
      weightKg, recordedAt: batch.productionCompletedAt, recordedBy: batch.hcpCompletedBy || batch.crumbingTeam || '',
    } },
  };
}

export function reconcileHcpChillerReturns(pool: HalloumiPool): HalloumiPool {
  const returnedKg = Object.values(pool.hcpChillerReturns || {}).reduce((sum, receipt) =>
    sum + (Number.isFinite(receipt.weightKg) && receipt.weightKg > 0 ? receipt.weightKg : 0), 0);
  const delta = returnedKg - (pool.hcpChillerReturnsAppliedKg || 0);
  if (delta === 0) return pool;
  // Other workflows copy this marker when using the displayed pool, so those
  // subsequent sales / allocations do not apply the same returns again.
  return { ...pool, availableForCrumbing: Math.round((pool.availableForCrumbing + delta) * 1e6) / 1e6,
    usedInCrumbing: Math.max(0, (pool.usedInCrumbing || 0) - delta), hcpChillerReturnsAppliedKg: returnedKg };
}
