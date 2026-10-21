export type BreadProductCode = 'TBN' | 'GBN';
export type BreadSkuCode = 'TN3' | 'TN5' | 'GN3' | 'GN4';

export interface BreadRecipeLine {
  id: string;
  name: string;
  baseAmount: number;
  unit: 'g' | 'kg';
  optional?: boolean;
}

export interface BreadIngredientCheckEvent {
  id: string;
  ingredientId: string;
  checked: boolean;
  occurredAt: string;
  recordedBy: string;
}

export interface BreadPackingEntry {
  id: string;
  sku: BreadSkuCode;
  cases: number;
  loosePackets: number;
  rejectedPieces: number;
  recordedAt: string;
  recordedBy: string;
}

export interface BreadProductionRound {
  id: string;
  roundNumber: number;
  /** Number of crates handed to packing. Informational; crate capacity varies. */
  cratesSent?: number;
  /** Legacy pre-packing count retained for rounds entered before crate tracking. */
  producedPieces?: number;
  manufacturingRejectPieces: number;
  recordedAt: string;
  recordedBy: string;
  packingEntries: BreadPackingEntry[];
}

export interface BreadDoughBatch {
  id: string;
  batchNumber: string;
  product: BreadProductCode;
  flourKg: number;
  createdAt: string;
  createdBy: string;
  checkedIngredients: Record<string, boolean>;
  checklistHistory: BreadIngredientCheckEvent[];
  rounds: BreadProductionRound[];
}

export interface BreadSkuDefinition {
  sku: BreadSkuCode;
  product: BreadProductCode;
  name: string;
  piecesPerPacket: number;
  packetsPerCase: number;
  saleType: 'Promotion' | 'Direct sale';
  promotionWith?: string[];
}

export const BREAD_FLOUR_BASE_KG = 12.5;

const sharedRecipe: BreadRecipeLine[] = [
  { id: 'sugar', name: 'Sugar', baseAmount: 290, unit: 'g' },
  { id: 'salt', name: 'Salt', baseAmount: 168, unit: 'g' },
  { id: 'skim_milk_powder', name: 'Skim milk powder', baseAmount: 700, unit: 'g' },
  { id: 'yeast', name: 'Yeast', baseAmount: 55, unit: 'g' },
  { id: 'ssl_silver', name: 'SSL Silver / Ultratex', baseAmount: 20, unit: 'g' },
  { id: 'supersoft', name: 'Supersoft', baseAmount: 13, unit: 'g' },
  { id: 'baking_powder', name: 'Baking powder', baseAmount: 109, unit: 'g' },
  { id: 'butter', name: 'Butter', baseAmount: 105, unit: 'g' },
  { id: 'oil', name: 'Oil', baseAmount: 1.25, unit: 'kg' },
];

const optionalGarlicNaanIngredients: BreadRecipeLine[] = [
  { id: 'dhania', name: 'Dhania', baseAmount: 0, unit: 'g', optional: true },
  { id: 'garlic_granules', name: 'Garlic granules', baseAmount: 0, unit: 'g', optional: true },
];

export const breadSkuDefinitions: BreadSkuDefinition[] = [
  { sku: 'TN3', product: 'TBN', name: 'Tandoori Butter Naan · TN3', piecesPerPacket: 3, packetsPerCase: 15, saleType: 'Promotion', promotionWith: ['MPAN100', 'RPAN100'] },
  { sku: 'TN5', product: 'TBN', name: 'Tandoori Butter Naan · TN5', piecesPerPacket: 5, packetsPerCase: 15, saleType: 'Direct sale' },
  { sku: 'GN3', product: 'GBN', name: 'Garlic Butter Naan · GN3', piecesPerPacket: 3, packetsPerCase: 15, saleType: 'Promotion', promotionWith: ['MPAN100', 'RPAN100'] },
  { sku: 'GN4', product: 'GBN', name: 'Garlic Butter Naan · GN4', piecesPerPacket: 4, packetsPerCase: 15, saleType: 'Direct sale' },
];

export function getBreadRecipe(product: BreadProductCode, flourKg: number): BreadRecipeLine[] {
  const multiplier = Math.max(0, flourKg) / BREAD_FLOUR_BASE_KG;
  const flour: BreadRecipeLine = { id: 'flour', name: 'Flour', baseAmount: BREAD_FLOUR_BASE_KG, unit: 'kg' };
  return [
    { ...flour, baseAmount: flourKg },
    ...sharedRecipe.map(line => ({ ...line, baseAmount: line.baseAmount * multiplier })),
    ...(product === 'GBN' ? optionalGarlicNaanIngredients.map(line => ({ ...line })) : []),
  ];
}

export function getBreadSku(sku: BreadSkuCode) {
  return breadSkuDefinitions.find(definition => definition.sku === sku)!;
}

export function getBreadRoundTotals(round: BreadProductionRound) {
  const packedPackets = round.packingEntries.reduce((total, entry) => {
    return total + entry.cases * getBreadSku(entry.sku).packetsPerCase + entry.loosePackets;
  }, 0);
  const packedPieces = round.packingEntries.reduce((total, entry) => {
    const definition = getBreadSku(entry.sku);
    return total + (entry.cases * definition.packetsPerCase + entry.loosePackets) * definition.piecesPerPacket;
  }, 0);
  const packingRejectPieces = round.packingEntries.reduce((total, entry) => total + entry.rejectedPieces, 0);
  const hasLegacyPrePackingCount = Number.isFinite(round.producedPieces);
  const totalProducedPieces = hasLegacyPrePackingCount
    ? round.producedPieces!
    : packedPieces + round.manufacturingRejectPieces + packingRejectPieces;
  const usableAfterManufacturing = hasLegacyPrePackingCount
    ? totalProducedPieces - round.manufacturingRejectPieces
    : null;
  const balancePieces = hasLegacyPrePackingCount && usableAfterManufacturing !== null
    ? usableAfterManufacturing - packedPieces - packingRejectPieces
    : null;
  const differenceFromPackedPieces = totalProducedPieces - packedPieces;
  return {
    packedPackets,
    packedPieces,
    packingRejectPieces,
    totalProducedPieces,
    differenceFromPackedPieces,
    usableAfterManufacturing,
    balancePieces,
    hasLegacyPrePackingCount,
  };
}
