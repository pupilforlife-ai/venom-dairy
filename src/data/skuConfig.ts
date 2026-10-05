export type PaneerSourceType = 'D' | 'C/S';
export type PackMode = 'units' | 'weight_loose' | 'weight_only';

export type FinishedGoodsBatchCodeMode = 'receipt_date' | 'manual';
export type FinishedGoodsBatchCodeReceiptSource = 'milk' | 'cream';

export interface FinishedGoodsBatchCodeDefinition {
  sku: string;
  prefix: string;
  mode: FinishedGoodsBatchCodeMode;
  receiptSource?: FinishedGoodsBatchCodeReceiptSource;
}

export interface PaneerSkuDefinition {
  sku: string;
  productName: string;
  unitWeightKg: number;
  unitsPerCase?: number;
  packMode: PackMode;
  sourceTypes: PaneerSourceType[];
  cutTypes?: string[];
}

export interface CrumbingSkuDefinition {
  sku: string;
  productName: string;
  unitWeightKg: number;
  unitsPerCase: number;
  packMode: 'units';
  crumbingType: 'SPP' | 'JP' | 'HCP';
}

// Paneer Board SKUs. SPP, JP and HCP are deliberately excluded: those are
// final products selected only after their Crumbing workflow is complete.
export const paneerSkuDefinitions: PaneerSkuDefinition[] = [
  { sku: 'MPAN100', productName: 'Malai Paneer - 1kg', unitWeightKg: 1, unitsPerCase: 15, packMode: 'units', sourceTypes: ['D'] },
  { sku: 'MPAN200', productName: 'Malai Paneer - 200g', unitWeightKg: 0.2, unitsPerCase: 24, packMode: 'units', sourceTypes: ['D'] },
  { sku: 'VJPAN', productName: 'Malai Paneer - 200g (VJ)', unitWeightKg: 0.2, unitsPerCase: 20, packMode: 'units', sourceTypes: ['D'] },
  { sku: 'MPAN400', productName: 'Malai Paneer - 400g', unitWeightKg: 0.4, unitsPerCase: 24, packMode: 'units', sourceTypes: ['D'] },
  { sku: 'MPAN010', productName: 'Malai Paneer - Restaurant Blocks', unitWeightKg: 0.4, unitsPerCase: 50, packMode: 'weight_loose', sourceTypes: ['D'], cutTypes: ['Restaurant blocks'] },
  { sku: 'MPAN101', productName: 'Malai Paneer - Clear 1kg', unitWeightKg: 1, unitsPerCase: 15, packMode: 'units', sourceTypes: ['D'], cutTypes: ['400g cubes'] },
  { sku: 'MPAN101 SPC CUT', productName: 'Malai Paneer - Clear 1kg SPC Cut', unitWeightKg: 1, unitsPerCase: 15, packMode: 'units', sourceTypes: ['D'], cutTypes: ['200g cubes'] },
  { sku: 'YD200', productName: 'Malai Paneer - 200g (YD)', unitWeightKg: 0.2, unitsPerCase: 36, packMode: 'units', sourceTypes: ['D'] },
  { sku: 'RPAN100', productName: 'Rozana Paneer - 1kg', unitWeightKg: 1, unitsPerCase: 15, packMode: 'units', sourceTypes: ['C/S'] },
  { sku: 'RPAN200', productName: 'Rozana Paneer - 200g', unitWeightKg: 0.2, unitsPerCase: 24, packMode: 'units', sourceTypes: ['C/S'] },
  { sku: 'RPAN400', productName: 'Rozana Paneer - 400g', unitWeightKg: 0.4, unitsPerCase: 24, packMode: 'units', sourceTypes: ['C/S'] },
  { sku: 'RPAN100 Rylands', productName: 'Rozana Paneer - 1kg (Rylands)', unitWeightKg: 1, unitsPerCase: 15, packMode: 'units', sourceTypes: ['C/S'] },
  { sku: 'RPAN400 Rylands', productName: 'Rozana Paneer - 400g (Rylands)', unitWeightKg: 0.4, unitsPerCase: 24, packMode: 'units', sourceTypes: ['C/S'] },
  { sku: 'RPAN010', productName: 'Rozana Paneer - Restaurant Blocks', unitWeightKg: 0.4, unitsPerCase: 50, packMode: 'weight_loose', sourceTypes: ['C/S'], cutTypes: ['Restaurant blocks'] },
  { sku: 'RPAN101', productName: 'Rozana Paneer - Clear 1kg', unitWeightKg: 1, unitsPerCase: 15, packMode: 'units', sourceTypes: ['C/S'], cutTypes: ['400g cubes'] },
  { sku: 'RPAN101 SPC CUT', productName: 'Rozana Paneer - Clear 1kg SPC Cut', unitWeightKg: 1, unitsPerCase: 15, packMode: 'units', sourceTypes: ['C/S'], cutTypes: ['200g cubes'] },
  { sku: 'PAN111', productName: 'PAN111 - Scramble Paneer', unitWeightKg: 0, packMode: 'weight_only', sourceTypes: ['D', 'C/S'] },
];

export const crumbingSkuDefinitions: CrumbingSkuDefinition[] = [
  { sku: 'SPP', productName: 'Vejoy Spicy Paneer Poppers', unitWeightKg: 0.25, unitsPerCase: 12, packMode: 'units', crumbingType: 'SPP' },
  { sku: 'ROZ SPP', productName: 'Rozana Spicy Paneer Poppers', unitWeightKg: 0.25, unitsPerCase: 12, packMode: 'units', crumbingType: 'SPP' },
  { sku: 'JP', productName: 'Vejoy Jalapeno Poppers', unitWeightKg: 0.25, unitsPerCase: 12, packMode: 'units', crumbingType: 'JP' },
  { sku: 'ROZ JP', productName: 'Rozana Jalapeno Poppers', unitWeightKg: 0.25, unitsPerCase: 12, packMode: 'units', crumbingType: 'JP' },
  { sku: 'HCP', productName: 'Vejoy Halloumi Poppers', unitWeightKg: 0.25, unitsPerCase: 12, packMode: 'units', crumbingType: 'HCP' },
  { sku: 'ROZ HCP', productName: 'Rozana Halloumi Poppers', unitWeightKg: 0.25, unitsPerCase: 12, packMode: 'units', crumbingType: 'HCP' },
];

// Finished-goods batch identity is deliberately separate from the internal
// production/source batch. The source batch remains the genealogy link, while
// this code is the label assigned when stock is handed to Distribution.
//
// The prefixes come from the production batch-code register. App SKU names
// are canonicalized here (for example MPAN101, and RPAN100 Rylands) so an
// alternate label cannot create a second identity for the same product.
export const finishedGoodsBatchCodeDefinitions: FinishedGoodsBatchCodeDefinition[] = [
  { sku: 'MPAN100', prefix: '11', mode: 'receipt_date', receiptSource: 'milk' },
  { sku: 'MPAN400', prefix: '13', mode: 'receipt_date', receiptSource: 'milk' },
  { sku: 'MPAN200', prefix: '12', mode: 'receipt_date', receiptSource: 'milk' },
  { sku: 'VJPAN', prefix: '14', mode: 'receipt_date', receiptSource: 'milk' },
  { sku: 'MPAN101', prefix: '15', mode: 'receipt_date', receiptSource: 'milk' },
  { sku: 'MPAN101 SPC CUT', prefix: '15', mode: 'receipt_date', receiptSource: 'milk' },
  { sku: 'MPAN010', prefix: '16', mode: 'receipt_date', receiptSource: 'milk' },
  { sku: 'YD200', prefix: '17', mode: 'receipt_date', receiptSource: 'milk' },
  { sku: 'RPAN100', prefix: '21', mode: 'receipt_date', receiptSource: 'milk' },
  { sku: 'RPAN400', prefix: '23', mode: 'receipt_date', receiptSource: 'milk' },
  { sku: 'RPAN200', prefix: '22', mode: 'receipt_date', receiptSource: 'milk' },
  { sku: 'RPAN100 Rylands', prefix: '24', mode: 'receipt_date', receiptSource: 'milk' },
  { sku: 'RPAN400 Rylands', prefix: '25', mode: 'receipt_date', receiptSource: 'milk' },
  { sku: 'RPAN010', prefix: '26', mode: 'receipt_date', receiptSource: 'milk' },
  { sku: 'SPP', prefix: '31', mode: 'manual' },
  { sku: 'JP', prefix: '32', mode: 'manual' },
  { sku: 'HCP', prefix: '33', mode: 'manual' },
  { sku: 'ROZ SPP', prefix: '41', mode: 'manual' },
  { sku: 'ROZ JP', prefix: '42', mode: 'manual' },
  { sku: 'ROZ HCP', prefix: '43', mode: 'manual' },
  { sku: 'BBO5', prefix: '51', mode: 'receipt_date', receiptSource: 'cream' },
  { sku: 'BB05', prefix: '51', mode: 'receipt_date', receiptSource: 'cream' },
  { sku: 'PUBB', prefix: '52', mode: 'receipt_date', receiptSource: 'cream' },
  { sku: 'PUBBB', prefix: '53', mode: 'receipt_date', receiptSource: 'cream' },
  { sku: 'PSBBB', prefix: '54', mode: 'receipt_date', receiptSource: 'cream' },
  { sku: '1.5KG', prefix: '61', mode: 'receipt_date', receiptSource: 'cream' },
  { sku: 'GHEE-1500', prefix: '61', mode: 'receipt_date', receiptSource: 'cream' },
  { sku: '400G', prefix: '62', mode: 'receipt_date', receiptSource: 'cream' },
  { sku: 'GHEE-400', prefix: '62', mode: 'receipt_date', receiptSource: 'cream' },
  { sku: 'TN3-(TBN PROMO)', prefix: '71', mode: 'manual' },
  { sku: 'TBN', prefix: '72', mode: 'manual' },
  { sku: 'GBN (PROMO)', prefix: '73', mode: 'manual' },
  { sku: 'GBN', prefix: '74', mode: 'manual' },
];

export const finishedGoodsBatchCodeBySku = Object.fromEntries(
  finishedGoodsBatchCodeDefinitions.map(definition => [definition.sku, definition]),
) as Record<string, FinishedGoodsBatchCodeDefinition>;

export function normalizeFinishedGoodsSku(sku: string) {
  const normalized = sku.trim().replace(/\s+/g, ' ');
  if (normalized.toUpperCase() === 'PAN101') return 'MPAN101';
  if (normalized.toUpperCase() === 'RPAN100 (RYLANDS)') return 'RPAN100 Rylands';
  if (normalized.toUpperCase() === 'RPAN400 (RYLANDS)') return 'RPAN400 Rylands';
  return normalized;
}

export function getFinishedGoodsBatchCodeDefinition(sku: string) {
  return finishedGoodsBatchCodeBySku[normalizeFinishedGoodsSku(sku)];
}

/** Convert an ISO receipt date (or a date-like value) to the register's DDMMYY suffix. */
export function formatReceiptDateForBatchCode(value?: string) {
  if (!value) return undefined;
  const isoMatch = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return undefined;
    return `${day}${month}${year.slice(-2)}`;
  }
  const compactMatch = value.trim().match(/^(\d{2})(\d{2})(\d{2})$/);
  if (!compactMatch) return undefined;
  const [, day, month, year] = compactMatch;
  const fullYear = 2000 + Number(year);
  const date = new Date(Date.UTC(fullYear, Number(month) - 1, Number(day)));
  return date.getUTCFullYear() === fullYear && date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day)
    ? `${day}${month}${year}`
    : undefined;
}

export function buildFinishedGoodsBatchCode(sku: string, receiptDate?: string) {
  const definition = getFinishedGoodsBatchCodeDefinition(sku);
  const suffix = formatReceiptDateForBatchCode(receiptDate);
  if (!definition || definition.mode !== 'receipt_date' || !suffix) return undefined;
  return `${definition.prefix}_${suffix}`;
}

export const paneerSkuByCode = Object.fromEntries(paneerSkuDefinitions.map(definition => [definition.sku, definition])) as Record<string, PaneerSkuDefinition>;
export const crumbingSkuByCode = Object.fromEntries(crumbingSkuDefinitions.map(definition => [definition.sku, definition])) as Record<string, CrumbingSkuDefinition>;

export function getAllowedPaneerSkus(roundType: PaneerSourceType, cuttingType?: string) {
  return paneerSkuDefinitions.filter(definition => {
    if (!definition.sourceTypes.includes(roundType)) return false;
    return !definition.cutTypes || !cuttingType || definition.cutTypes.includes(cuttingType);
  });
}

export function getPaneerPackWeight(definition: PaneerSkuDefinition | undefined, cases: number, loose: number, looseWeightKg: number, weightKg: number) {
  if (!definition) return 0;
  if (definition.packMode === 'weight_only') return Math.max(0, weightKg);
  const caseWeight = (definition.unitsPerCase || 0) * definition.unitWeightKg;
  const looseWeight = definition.packMode === 'weight_loose'
    ? Math.max(0, looseWeightKg)
    : Math.max(0, loose) * definition.unitWeightKg;
  return Math.max(0, cases) * caseWeight + looseWeight;
}

export function getCrumbingPackWeight(definition: CrumbingSkuDefinition | undefined, cases: number, loose: number) {
  if (!definition) return 0;
  return Math.max(0, cases) * definition.unitsPerCase * definition.unitWeightKg + Math.max(0, loose) * definition.unitWeightKg;
}
