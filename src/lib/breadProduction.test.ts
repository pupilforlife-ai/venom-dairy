import { describe, expect, it } from 'vitest';
import { BreadProductionRound, getBreadRecipe, getBreadRoundTotals } from './breadProduction';

describe('bread production calculations', () => {
  it('scales both core recipes proportionally to flour', () => {
    expect(getBreadRecipe('TBN', 25).find(line => line.id === 'yeast')?.baseAmount).toBe(110);
    expect(getBreadRecipe('GBN', 6.25).find(line => line.id === 'oil')?.baseAmount).toBe(0.625);
  });

  it('shows unquantified discretionary GBN ingredients without scaling a made-up amount', () => {
    const recipe = getBreadRecipe('GBN', 25);
    expect(recipe.find(line => line.id === 'dhania')).toMatchObject({ optional: true, baseAmount: 0 });
    expect(recipe.find(line => line.id === 'garlic_granules')).toMatchObject({ optional: true, baseAmount: 0 });
    expect(getBreadRecipe('TBN', 25).some(line => line.optional)).toBe(false);
  });

  it('reconciles cases, loose packets, and rejects using individual naan pieces', () => {
    const round: BreadProductionRound = {
      id: 'round-1',
      roundNumber: 1,
      producedPieces: 200,
      manufacturingRejectPieces: 5,
      recordedAt: '2026-10-19T08:00:00.000Z',
      recordedBy: 'operator',
      packingEntries: [
        { id: 'pack-1', sku: 'TN3', cases: 1, loosePackets: 2, rejectedPieces: 3, recordedAt: '', recordedBy: '' },
        { id: 'pack-2', sku: 'TN5', cases: 0, loosePackets: 1, rejectedPieces: 1, recordedAt: '', recordedBy: '' },
      ],
    };
    expect(getBreadRoundTotals(round)).toEqual({
      packedPackets: 18,
      packedPieces: 56,
      packingRejectPieces: 4,
      totalProducedPieces: 200,
      differenceFromPackedPieces: 144,
      usableAfterManufacturing: 195,
      balancePieces: 135,
      hasLegacyPrePackingCount: true,
    });
  });

  it('derives new round production from packed pieces and rejects without using crate count as a conversion', () => {
    const round: BreadProductionRound = {
      id: 'round-new',
      roundNumber: 1,
      cratesSent: 4,
      manufacturingRejectPieces: 2,
      recordedAt: '2026-10-19T08:00:00.000Z',
      recordedBy: 'operator',
      packingEntries: [
        { id: 'pack-new', sku: 'TN3', cases: 1, loosePackets: 1, rejectedPieces: 3, recordedAt: '', recordedBy: '' },
      ],
    };
    expect(getBreadRoundTotals(round)).toMatchObject({
      packedPackets: 16,
      packedPieces: 48,
      packingRejectPieces: 3,
      totalProducedPieces: 53,
      differenceFromPackedPieces: 5,
      usableAfterManufacturing: null,
      balancePieces: null,
      hasLegacyPrePackingCount: false,
    });
  });
});
