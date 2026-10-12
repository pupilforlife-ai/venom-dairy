import { describe, expect, it } from 'vitest';
import type { ProductionRound } from '../data/mockData';
import { buildProductionRoundHistory, formatRoundHistoryTime } from './productionRoundHistory';

function makeRound(overrides: Partial<ProductionRound> = {}): ProductionRound {
  return {
    id: 'round-1',
    milkLotId: 'lot-1',
    milkLotCode: '111026',
    shiftId: 'shift-1',
    shiftNumber: 2,
    roundNumber: 1,
    type: 'D',
    status: 'scheduled',
    team: ['Vuyo'],
    plannedInput: 500,
    actualInput: 0,
    outputWeight: 0,
    startTime: '2026-10-12T04:24:00.000Z',
    locked: false,
    ...overrides,
  };
}

describe('production round history', () => {
  it('keeps every repeated timestamped packing event', () => {
    const round = makeRound({
      status: 'packed',
      historyEvents: [
        { id: 'event-1', type: 'packing_recorded', stage: 'Packing Recorded', occurredAt: '2026-10-12T12:00:01.000Z', details: 'MPAN100 · 10 cases', recordedBy: 'Vuyo' },
        { id: 'event-2', type: 'packing_recorded', stage: 'Packing Recorded', occurredAt: '2026-10-12T12:05:02.000Z', details: 'MPAN200 · 5 cases', recordedBy: 'Vuyo' },
      ],
    });

    const packing = buildProductionRoundHistory(round).filter(item => item.stage === 'Packing Recorded');
    expect(packing).toHaveLength(2);
    expect(packing.map(item => item.occurredAt)).toEqual([
      '2026-10-12T12:00:01.000Z',
      '2026-10-12T12:05:02.000Z',
    ]);
  });

  it('does not invent dates for legacy events that were never timestamped', () => {
    const round = makeRound({
      status: 'frozen',
      vat: 'vat3',
      startingTemperature: 9.3,
      cutBy: 'Sane',
      cuttingType: '400g cubes',
      numberOfBlocks: 6,
      outputWeight: 75.445,
    });

    const history = buildProductionRoundHistory(round);
    expect(history.find(item => item.stage === 'In Production')?.legacyTimestampMissing).toBe(true);
    expect(history.find(item => item.stage === 'Cut')?.occurredAt).toBeUndefined();
    expect(history.find(item => item.stage === 'Frozen')?.legacyTimestampMissing).toBe(true);
    expect(formatRoundHistoryTime(undefined)).toContain('legacy record');
  });

  it('uses the exact stored timestamp and actor for new workflow events', () => {
    const round = makeRound({
      status: 'in_production',
      vat: 'vat2',
      historyEvents: [{
        id: 'event-start',
        type: 'in_production',
        stage: 'In Production',
        occurredAt: '2026-10-12T06:30:45.000Z',
        details: 'Vat 2 · Starting temp: 8°C · 500 L',
        recordedBy: 'Pretty',
      }],
    });

    const start = buildProductionRoundHistory(round).find(item => item.stage === 'In Production');
    expect(start).toMatchObject({ occurredAt: '2026-10-12T06:30:45.000Z', recordedBy: 'Pretty' });
    expect(start?.legacyTimestampMissing).toBeUndefined();
  });
});
