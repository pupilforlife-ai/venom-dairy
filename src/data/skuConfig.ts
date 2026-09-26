export type PaneerSourceType = 'D' | 'C/S';
export type PackMode = 'units' | 'weight_loose' | 'weight_only';

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
