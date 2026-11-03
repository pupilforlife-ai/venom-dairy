// Issued recipe quantities are immutable inputs to this report. Balances are
// separate, audited observations; never rewrite a +1 counter to deduct a return.
export const coatingIngredientNames = {
  iyababa: 'Iyababa (flavour coat)', predust: 'Predust', batterMix: 'Batter mix (dry)', adajio: 'Adajio',
} as const;
export type CoatingIngredient = keyof typeof coatingIngredientNames;
export type CoatingQuantities = Record<CoatingIngredient, number>;
export interface CoatingBalanceMeasurement {
  flavourBasis: 'separate' | 'mixed';
  iyababaKg: number;
  predustKg: number;
  flavourMixKg: number;
  batterBasis: 'dry' | 'prepared';
  batterKg: number;
  // Retained for historical weighed-total records; new entries use the recipe.
  preparedBatterTotalKg?: number;
  batterCalculationBasis?: 'recipe_ratio' | 'weighed_total';
  recipeBatterWaterL?: number;
  waterKgPerL?: number;
  adajioKg: number;
}
export interface CoatingBalanceRecord {
  id: string;
  recordedAt: string;
  recordedBy: string;
  note: string;
  supersedes: string[];
  issued: CoatingQuantities;
  remaining: CoatingQuantities;
  measurement: CoatingBalanceMeasurement;
}
export interface CoatingBatch {
  type: string;
  recipe?: { flavourIyababKg: number; flavourPredustKg: number; batterIyababaKg: number; batterWaterL?: number; breadingAdajioKg: number };
  jpCrumbing?: { predustKg: number; batterMixKg: number; batterWaterL?: number; adajioKg: number };
  ingredientBalanceHistory?: Record<string, CoatingBalanceRecord>;
  clubbedInto?: string;
}
const keys = Object.keys(coatingIngredientNames) as CoatingIngredient[];
const round = (value: number) => Math.round(value * 1e6) / 1e6;
const tolerance = 0.000001;

export function getCoatingIssued(batch: CoatingBatch): CoatingQuantities {
  return {
    iyababa: batch.recipe?.flavourIyababKg ?? 0,
    predust: batch.jpCrumbing?.predustKg ?? batch.recipe?.flavourPredustKg ?? 0,
    batterMix: batch.jpCrumbing?.batterMixKg ?? batch.recipe?.batterIyababaKg ?? 0,
    adajio: batch.jpCrumbing?.adajioKg ?? batch.recipe?.breadingAdajioKg ?? 0,
  };
}
export function getPreparedBatterRecipe(batch: CoatingBatch) {
  const powderKg = getCoatingIssued(batch).batterMix;
  // All three current products use 1 kg powder + 2.5 L water per addition.
  // Prefer the recorded recipe where present, including a future changed ratio.
  const waterL = batch.jpCrumbing?.batterWaterL ?? batch.recipe?.batterWaterL ?? powderKg * 2.5;
  const waterKgPerL = 1; // Explicit factory-accounting approximation, not dry powder.
  return { powderKg, waterL, waterKgPerL, totalKg: powderKg + waterL * waterKgPerL };
}
function sameBatterRecipe(batch: CoatingBatch, record: CoatingBalanceRecord) {
  return record.measurement.batterCalculationBasis !== 'recipe_ratio'
    || (record.measurement.recipeBatterWaterL !== undefined
      && Math.abs(record.measurement.recipeBatterWaterL - getPreparedBatterRecipe(batch).waterL) <= tolerance);
}
function validWeight(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Enter a valid non-negative ${label} weight, including 0 when none remains.`);
}
function sameQuantities(a: CoatingQuantities, b: CoatingQuantities) {
  return keys.every(key => Number.isFinite(a[key]) && Number.isFinite(b[key]) && Math.abs(a[key] - b[key]) <= tolerance);
}
export function coatingBalanceHeads(batch: CoatingBatch): CoatingBalanceRecord[] {
  const records = Object.values(batch.ingredientBalanceHistory || {});
  const superseded = new Set(records.flatMap(record => record.supersedes));
  return records.filter(record => !superseded.has(record.id)).sort((a, b) => a.id.localeCompare(b.id));
}
export function getCoatingBalanceReport(batch: CoatingBatch) {
  const issued = getCoatingIssued(batch);
  const heads = coatingBalanceHeads(batch);
  const record = heads.length === 1 ? heads[0] : undefined;
  const status = heads.length > 1 ? 'conflict' : !record ? 'missing' : !sameQuantities(issued, record.issued) || !sameBatterRecipe(batch, record) ? 'changed' : 'recorded';
  return {
    status, record, issued,
    rows: keys.filter(key => key !== 'iyababa' || batch.type === 'SPP').map(key => ({
      key, label: coatingIngredientNames[key], issuedKg: issued[key],
      remainingKg: status === 'recorded' ? record!.remaining[key] : null,
      consumedKg: status === 'recorded' ? round(issued[key] - record!.remaining[key]) : null,
    })),
  };
}

export function buildCoatingBalanceRecord(batch: CoatingBatch, measurement: CoatingBalanceMeasurement,
  meta: { id: string; recordedAt: string; recordedBy: string; note: string }): CoatingBalanceRecord {
  if (batch.clubbedInto) throw new Error('Record the balance on the combined batch; this source report remains unchanged.');
  if (!meta.id || !meta.recordedBy.trim() || !Number.isFinite(Date.parse(meta.recordedAt))) throw new Error('A recorder, timestamp and record ID are required.');
  if (coatingBalanceHeads(batch).length && !meta.note.trim()) throw new Error('Enter a reason for revising or rechecking the ingredient balances.');
  const issued = getCoatingIssued(batch);
  keys.forEach(key => validWeight(issued[key], 'issued ' + coatingIngredientNames[key]));
  if (!keys.some(key => issued[key] > 0)) throw new Error('Record the ingredient additions before entering their balances.');
  if (!['separate', 'mixed'].includes(measurement.flavourBasis) || !['dry', 'prepared'].includes(measurement.batterBasis)) throw new Error('Choose how each balance was weighed.');
  const remaining: CoatingQuantities = { iyababa: 0, predust: 0, batterMix: 0, adajio: measurement.adajioKg };
  if (batch.type === 'SPP' && measurement.flavourBasis === 'mixed') {
    validWeight(measurement.flavourMixKg, 'unused flavour mixture');
    const flavourIssuedKg = issued.iyababa + issued.predust;
    if (measurement.flavourMixKg > flavourIssuedKg + tolerance) throw new Error('Unused flavour mixture cannot exceed the dry flavour ingredients issued.');
    remaining.iyababa = flavourIssuedKg ? measurement.flavourMixKg * issued.iyababa / flavourIssuedKg : 0;
    remaining.predust = flavourIssuedKg ? measurement.flavourMixKg * issued.predust / flavourIssuedKg : 0;
  } else {
    remaining.iyababa = batch.type === 'SPP' ? measurement.iyababaKg : 0;
    remaining.predust = measurement.predustKg;
  }
  validWeight(measurement.batterKg, 'unused batter');
  const savedMeasurement = { ...measurement };
  if (measurement.batterBasis === 'prepared') {
    const useRecipe = measurement.batterCalculationBasis === 'recipe_ratio' || measurement.preparedBatterTotalKg === undefined;
    const prepared = getPreparedBatterRecipe(batch);
    const total = useRecipe ? prepared.totalKg : measurement.preparedBatterTotalKg!;
    if (useRecipe) validWeight(prepared.waterL, 'recipe water');
    if (!Number.isFinite(total) || total < issued.batterMix || total <= 0) throw new Error('The prepared batter recipe or historical weighed total is invalid. Check its recorded inputs.');
    if (measurement.batterKg > total + tolerance) throw new Error('Remaining prepared batter cannot exceed the total made from the recorded additions.');
    remaining.batterMix = measurement.batterKg * issued.batterMix / total;
    savedMeasurement.preparedBatterTotalKg = total;
    savedMeasurement.batterCalculationBasis = useRecipe ? 'recipe_ratio' : 'weighed_total';
    if (useRecipe) { savedMeasurement.recipeBatterWaterL = prepared.waterL; savedMeasurement.waterKgPerL = prepared.waterKgPerL; }
  } else remaining.batterMix = measurement.batterKg;
  keys.forEach(key => {
    validWeight(remaining[key], 'unused ' + coatingIngredientNames[key]);
    if (remaining[key] > issued[key] + tolerance) throw new Error(`${coatingIngredientNames[key]} balance cannot exceed the recorded issue. Check the additions and measurement basis.`);
    remaining[key] = round(Math.min(issued[key], remaining[key]));
  });
  return { ...meta, recordedBy: meta.recordedBy.trim(), note: meta.note.trim(),
    supersedes: coatingBalanceHeads(batch).map(record => record.id), issued: { ...issued }, remaining, measurement: savedMeasurement };
}

export function appendCoatingBalance<T extends CoatingBatch>(batch: T, record: CoatingBalanceRecord): T {
  const existing = batch.ingredientBalanceHistory?.[record.id];
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(record)) throw new Error('This balance record ID is already in use. Reopen the form.');
    return batch; // Retry, not another deduction.
  }
  if (batch.clubbedInto) throw new Error('This batch was clubbed while the form was open. Record balances on the combined batch.');
  if (!sameQuantities(getCoatingIssued(batch), record.issued) || !sameBatterRecipe(batch, record)) throw new Error('Ingredient additions changed while this form was open. Reopen and recheck the balances.');
  const heads = coatingBalanceHeads(batch).map(item => item.id).sort();
  if (JSON.stringify(heads) !== JSON.stringify([...record.supersedes].sort())) throw new Error('Another balance was recorded. Reopen the latest record before saving.');
  return { ...batch, ingredientBalanceHistory: { ...batch.ingredientBalanceHistory, [record.id]: record } };
}

// Cream cheese already has an authoritative filling/carry-forward record.
// Read it; do not create a second balance that could double-credit carryover.
export function getCreamCheeseUsage(batch: {
  jpPrepping?: { totalCreamCheeseAvailableKg?: number; pan111InputKg: number; creamKg: number; blackPepperKg: number; saltKg: number; carriedCreamCheeseKg?: number };
  jpFilling?: { creamCheeseAvailableKg?: number; creamCheeseLeftoverKg?: number; creamCheeseBalanceRecorded?: boolean; creamCheeseDisposition?: string };
}) {
  const prep = batch.jpPrepping;
  const availableKg = prep?.totalCreamCheeseAvailableKg ?? batch.jpFilling?.creamCheeseAvailableKg
    ?? (prep ? prep.pan111InputKg + prep.creamKg + prep.blackPepperKg + prep.saltKg + (prep.carriedCreamCheeseKg || 0) : 0);
  const remainingKg = batch.jpFilling?.creamCheeseLeftoverKg;
  const issuedUnchanged = batch.jpFilling?.creamCheeseAvailableKg === undefined || Math.abs(availableKg - batch.jpFilling.creamCheeseAvailableKg) <= tolerance;
  const recorded = issuedUnchanged && batch.jpFilling?.creamCheeseBalanceRecorded !== false && remainingKg !== undefined && Number.isFinite(remainingKg) && remainingKg >= 0 && remainingKg <= availableKg;
  return { availableKg, remainingKg: recorded ? remainingKg : null,
    consumedKg: recorded ? round(availableKg - remainingKg) : null,
    disposition: batch.jpFilling?.creamCheeseDisposition || '' };
}
