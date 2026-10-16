import { describe, expect, it } from 'vitest';
import { getMilkLotVesselBalances, planMilkSaleAllocations } from './milkVesselAllocation';
import type { MilkLot } from '../data/mockData';

describe('milk sale vessel allocation', () => {
  it('falls back to available vessels when the preferred source is empty', () => {
    const availability = [
      { id: 'silo', label: 'Silo', capacity: 10000, openingLitres: 600, productionDrawLitres: 0, salesDrawLitres: 0, otherDrawLitres: 0, litres: 600 },
    ];
    expect(planMilkSaleAllocations(500, availability, 'auxiliary')).toEqual({
      allocations: [{ vesselId: 'silo', quantity: 500 }],
      shortfall: 0,
    });
  });

  it('splits an automatic sale across available vessels when necessary', () => {
    const availability = [
      { id: 'ibc-1', label: 'IBC #1', capacity: 1000, openingLitres: 300, productionDrawLitres: 0, salesDrawLitres: 0, otherDrawLitres: 0, litres: 300 },
      { id: 'bmc-2', label: 'BMC #2', capacity: 2500, openingLitres: 500, productionDrawLitres: 0, salesDrawLitres: 0, otherDrawLitres: 0, litres: 500 },
    ];
    expect(planMilkSaleAllocations(700, availability, 'ibc')).toEqual({
      allocations: [{ vesselId: 'ibc-1', quantity: 300 }, { vesselId: 'bmc-2', quantity: 400 }],
      shortfall: 0,
    });
  });

  it('honors a manually selected vessel without blocking other sale sources globally', () => {
    const availability = [
      { id: 'silo', label: 'Silo', capacity: 10000, openingLitres: 0, productionDrawLitres: 0, salesDrawLitres: 0, otherDrawLitres: 0, litres: 0 },
      { id: 'bmc-1', label: 'BMC #1', capacity: 3000, openingLitres: 850, productionDrawLitres: 0, salesDrawLitres: 0, otherDrawLitres: 0, litres: 850 },
    ];
    expect(planMilkSaleAllocations(400, availability, null, 'bmc-1')).toEqual({
      allocations: [{ vesselId: 'bmc-1', quantity: 400 }],
      shortfall: 0,
    });
  });

  it('uses saved vessel allocations in the auditable vessel ledger', () => {
    const lot = {
      id: 'lot-1', lotCode: '161026', receiptDate: '2026-10-16', supplier: 'Test',
      litresReceived: 20000, litresConsumed: 0, litresRemaining: 19500,
      litresRejected: 0, litresSpilled: 0, litresSold: 500, status: 'active',
      milkSales: [{
        id: 'sale-1', milkLotId: 'lot-1', saleDate: '2026-10-16', customer: 'Test customer',
        quantity: 500, sourceVessel: 'silo', sourceAllocations: [{ vesselId: 'silo', quantity: 500 }],
      }],
    } as MilkLot;
    const ledger = getMilkLotVesselBalances(lot, []);
    expect(ledger.vessels.find(vessel => vessel.id === 'silo')?.salesDrawLitres).toBe(500);
    expect(ledger.ruleShortfallLitres).toBe(0);
  });
});
