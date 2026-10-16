import { getMilkLotAccounting, MilkLot, milkStorageVessels, ProductionRound } from '../data/mockData';

export type MilkSaleVesselSource = 'ibc' | 'auxiliary';

export interface MilkVesselBalance {
  id: string;
  label: string;
  capacity: number | null;
  openingLitres: number;
  productionDrawLitres: number;
  salesDrawLitres: number;
  otherDrawLitres: number;
  litres: number;
}

export interface MilkSaleAllocation {
  vesselId: string;
  quantity: number;
}

const fixedOpeningOrder = ['direct-production', 'bmc-2', 'silo', 'bmc-1', 'bmc-3'];
const ibcIds = milkStorageVessels.filter(vessel => vessel.id.startsWith('ibc-')).map(vessel => vessel.id);
export const productionVesselDeductionOrder = [...fixedOpeningOrder, 'auxiliary', ...ibcIds];

export function getMilkSaleVesselSource(quantity: number): MilkSaleVesselSource | null {
  if (quantity > 0 && quantity % 1000 === 0) return 'ibc';
  if (quantity > 0 && quantity < 400) return 'auxiliary';
  return null;
}

function getOpeningBalances(receivedLitres: number) {
  const balances = new Map(milkStorageVessels.map(vessel => [vessel.id, 0]));
  let remaining = Math.max(0, receivedLitres);

  fixedOpeningOrder.forEach(id => {
    const vessel = milkStorageVessels.find(candidate => candidate.id === id);
    if (!vessel?.capacity || remaining <= 0) return;
    const allocated = Math.min(vessel.capacity, remaining);
    balances.set(id, allocated);
    remaining -= allocated;
  });

  // Milk beyond the fixed tanks is stored in full 1,000 L IBC units. Any
  // non-IBC remainder is the auditable auxiliary balance.
  ibcIds.forEach(id => {
    if (remaining < 1000) return;
    balances.set(id, 1000);
    remaining -= 1000;
  });
  balances.set('auxiliary', remaining);
  return balances;
}

function deduct(
  balances: Map<string, MilkVesselBalance>,
  vesselIds: string[],
  requestedLitres: number,
  field: 'productionDrawLitres' | 'salesDrawLitres' | 'otherDrawLitres',
) {
  let remainingDraw = Math.max(0, requestedLitres);
  vesselIds.forEach(id => {
    if (remainingDraw <= 0) return;
    const vessel = balances.get(id);
    if (!vessel || vessel.litres <= 0) return;
    const draw = Math.min(vessel.litres, remainingDraw);
    vessel.litres -= draw;
    vessel[field] += draw;
    remainingDraw -= draw;
  });
  return remainingDraw;
}

export function getMilkLotVesselBalances(lot: MilkLot, rounds: ProductionRound[]) {
  const accounting = getMilkLotAccounting(lot, rounds);
  const opening = getOpeningBalances(lot.litresReceived);
  const balances = new Map<string, MilkVesselBalance>(milkStorageVessels.map(vessel => [vessel.id, {
    ...vessel,
    openingLitres: opening.get(vessel.id) || 0,
    productionDrawLitres: 0,
    salesDrawLitres: 0,
    otherDrawLitres: 0,
    litres: opening.get(vessel.id) || 0,
  }]));

  let ruleShortfallLitres = 0;
  let saleLitresToAllocate = accounting.sold;
  (lot.milkSales || []).forEach(sale => {
    if (saleLitresToAllocate <= 0) return;
    const saleQuantity = Math.min(Math.max(0, sale.quantity), saleLitresToAllocate);
    if (sale.sourceAllocations?.length) {
      let allocatedSale = 0;
      sale.sourceAllocations.forEach(allocation => {
        const requested = Math.min(Math.max(0, allocation.quantity), saleQuantity - allocatedSale);
        if (requested <= 0) return;
        const shortfall = deduct(balances, [allocation.vesselId], requested, 'salesDrawLitres');
        allocatedSale += requested - shortfall;
      });
      ruleShortfallLitres += Math.max(0, saleQuantity - allocatedSale);
    } else {
      const source = sale.sourceVessel || getMilkSaleVesselSource(sale.quantity);
      if (source === 'ibc') {
        ruleShortfallLitres += deduct(balances, ibcIds, saleQuantity, 'salesDrawLitres');
      } else if (source === 'auxiliary') {
        ruleShortfallLitres += deduct(balances, ['auxiliary'], saleQuantity, 'salesDrawLitres');
      } else if (source && balances.has(source)) {
        ruleShortfallLitres += deduct(balances, [source], saleQuantity, 'salesDrawLitres');
      } else {
        // Preserve historical sales created before source recording existed.
        ruleShortfallLitres += deduct(balances, productionVesselDeductionOrder, saleQuantity, 'salesDrawLitres');
      }
    }
    saleLitresToAllocate -= saleQuantity;
  });

  // Some legacy lots have a reconciled sold total without itemised sale rows.
  // Keep the vessel ledger equal to the milk-balance equation while marking
  // those litres as a historical fallback rather than inventing a source.
  if (saleLitresToAllocate > 0) {
    ruleShortfallLitres += deduct(
      balances,
      productionVesselDeductionOrder,
      saleLitresToAllocate,
      'salesDrawLitres',
    );
  }

  ruleShortfallLitres += deduct(balances, productionVesselDeductionOrder, accounting.consumed, 'productionDrawLitres');
  ruleShortfallLitres += deduct(
    balances,
    productionVesselDeductionOrder,
    Math.max(0, lot.litresRejected) + Math.max(0, lot.litresSpilled),
    'otherDrawLitres',
  );

  // A shortfall means historical records demand more milk than the opening
  // vessel ledger can supply. Keep it visible for audit rather than inventing
  // a negative vessel balance.
  const vessels = milkStorageVessels.map(vessel => balances.get(vessel.id)!).filter(vessel =>
    vessel.openingLitres > 0 || vessel.productionDrawLitres > 0 || vessel.salesDrawLitres > 0 || vessel.otherDrawLitres > 0
  );
  return { vessels, ruleShortfallLitres, remainingLitres: vessels.reduce((sum, vessel) => sum + vessel.litres, 0) };
}

export function getMilkSaleSourceAvailability(lot: MilkLot, rounds: ProductionRound[]) {
  const { vessels } = getMilkLotVesselBalances(lot, rounds);
  return {
    ibc: vessels.filter(vessel => vessel.id.startsWith('ibc-')).reduce((sum, vessel) => sum + vessel.litres, 0),
    auxiliary: vessels.find(vessel => vessel.id === 'auxiliary')?.litres || 0,
    vessels: vessels.filter(vessel => vessel.litres > 0.01),
  };
}

/**
 * Preferred sources are operational guidance only. Automatic allocation tries
 * the preferred source first, then uses any remaining vessel stock so a sale
 * is not blocked just because the preferred vessel is empty.
 */
export function planMilkSaleAllocations(
  quantity: number,
  availability: MilkVesselBalance[],
  preferredSource: MilkSaleVesselSource | null,
  selectedSource = 'auto',
): { allocations: MilkSaleAllocation[]; shortfall: number } {
  let remaining = Math.max(0, quantity);
  const availableById = new Map(availability.map(vessel => [vessel.id, Math.max(0, vessel.litres)]));
  const ids = selectedSource === 'auto'
    ? [
      ...(preferredSource === 'ibc' ? ibcIds : preferredSource === 'auxiliary' ? ['auxiliary'] : []),
      ...productionVesselDeductionOrder,
    ]
    : [selectedSource];
  const uniqueIds = [...new Set(ids)];
  const allocations: MilkSaleAllocation[] = [];

  uniqueIds.forEach(vesselId => {
    if (remaining <= 0) return;
    const available = availableById.get(vesselId) || 0;
    if (available <= 0) return;
    const allocated = Math.min(available, remaining);
    allocations.push({ vesselId, quantity: allocated });
    remaining -= allocated;
  });

  return { allocations, shortfall: remaining };
}
