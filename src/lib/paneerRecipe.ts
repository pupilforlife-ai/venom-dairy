import type { ProductionRound } from '../data/mockData';

export type PaneerRecipeType = 'D' | 'C/S';
export type PaneerIngredientId = 'calcium_chloride' | 'gdl' | 'potassium_sorbate' | 'fis' | 'af_oil';
export interface PaneerRecipeLine {
  id: PaneerIngredientId;
  name: string;
  quantity: number;
  unit: 'g' | 'kg';
}
export interface PaneerRecipeSnapshot {
  version: string;
  paneerType: PaneerRecipeType;
  basisMilkLitres: number;
  milkLitres: number;
  lines: PaneerRecipeLine[];
}
export interface PaneerIngredientIssue extends PaneerRecipeSnapshot {
  id: string;
  kind: 'issue' | 'adjustment';
  recordedAt: string;
  recordedBy: string;
  vat: 'vat2' | 'vat3';
  reason: string;
  // Signed differences from the preceding allocation. Snapshots themselves
  // are replacement totals, never extra quantities to add together.
  changes: PaneerRecipeLine[];
}

export const PANEER_RECIPE_VERSION = 'paneer-2026-10-28-v1';
export const PANEER_RECIPE_BASIS_LITRES = 500;

const shared: ReadonlyArray<PaneerRecipeLine> = [
  { id: 'calcium_chloride', name: 'Calcium chloride', quantity: 400, unit: 'g' },
  { id: 'gdl', name: 'GDL', quantity: 1850, unit: 'g' },
  { id: 'potassium_sorbate', name: 'Potassium sorbate', quantity: 250, unit: 'g' },
];
const csOnly: ReadonlyArray<PaneerRecipeLine> = [
  { id: 'fis', name: 'FIS', quantity: 835, unit: 'g' },
  { id: 'af_oil', name: 'AF oil', quantity: 20, unit: 'kg' },
];

export function getPaneerRecipe(type: PaneerRecipeType, milkLitres: number): PaneerRecipeSnapshot {
  if (type !== 'D' && type !== 'C/S') throw new Error('A paneer recipe is available only for D and C/S rounds.');
  if (!Number.isFinite(milkLitres) || milkLitres <= 0) throw new Error('Enter a positive milk quantity for the paneer recipe.');
  return {
    version: PANEER_RECIPE_VERSION, paneerType: type, basisMilkLitres: PANEER_RECIPE_BASIS_LITRES, milkLitres,
    lines: [...shared, ...(type === 'C/S' ? csOnly : [])].map(line => ({ ...line,
      quantity: Math.round(line.quantity * milkLitres / PANEER_RECIPE_BASIS_LITRES * 1e6) / 1e6,
    })),
  };
}

export function getPaneerRecipeMilkLitres(round: Pick<ProductionRound, 'actualInput' | 'plannedInput'>) {
  return Number.isFinite(round.actualInput) && round.actualInput > 0 ? round.actualInput : round.plannedInput;
}

export function latestPaneerIngredientIssue(round: Pick<ProductionRound, 'paneerIngredientIssues'>) {
  return round.paneerIngredientIssues?.[round.paneerIngredientIssues.length - 1];
}

export function paneerIssueMatchesRound(round: ProductionRound) {
  const issue = latestPaneerIngredientIssue(round);
  return Boolean(issue && issue.paneerType === round.type && issue.milkLitres === getPaneerRecipeMilkLitres(round));
}

/** Called only on a genuine production start, or a correction to an already
 * issued round. Merely opening a form or viewing an old round issues nothing. */
export function recordPaneerIngredientAllocation(
  round: ProductionRound, recordedAt: string, recordedBy: string, reason: string, allowInitialIssue = false,
): ProductionRound {
  if (round.type !== 'D' && round.type !== 'C/S') return round;
  const previous = latestPaneerIngredientIssue(round);
  if (!previous && (!allowInitialIssue || round.status !== 'in_production' || !round.vat)) return round;
  if (previous && paneerIssueMatchesRound(round)) return round;
  const recipe = getPaneerRecipe(round.type, getPaneerRecipeMilkLitres(round));
  const ids = new Set([...recipe.lines.map(line => line.id), ...(previous?.lines || []).map(line => line.id)]);
  const changes = [...ids].flatMap(id => {
    const next = recipe.lines.find(line => line.id === id);
    const old = previous?.lines.find(line => line.id === id);
    const quantity = Math.round(((next?.quantity || 0) - (old?.quantity || 0)) * 1e6) / 1e6;
    return quantity === 0 ? [] : [{ ...(next || old)!, quantity }];
  });
  const issue: PaneerIngredientIssue = {
    ...recipe, id: `paneer-issue-${round.id}-${(round.paneerIngredientIssues?.length || 0) + 1}`,
    kind: previous ? 'adjustment' : 'issue', recordedAt, recordedBy, vat: round.vat || previous!.vat, reason, changes,
  };
  return { ...round, paneerIngredientIssues: [...(round.paneerIngredientIssues || []), issue],
    historyEvents: [...(round.historyEvents || []), {
      id: issue.id, type: previous ? 'paneer_recipe_adjusted' : 'paneer_ingredients_issued',
      stage: previous ? 'Paneer Recipe Allocation Adjusted' : 'Paneer Ingredients Issued',
      occurredAt: recordedAt, recordedBy, source: 'workflow',
      details: `${recipe.paneerType} · ${recipe.milkLitres} L · ${changes.map(line => `${line.name}: ${previous && line.quantity > 0 ? '+' : ''}${line.quantity} ${line.unit}`).join(' · ')} · ${reason}`,
    }],
  };
}
