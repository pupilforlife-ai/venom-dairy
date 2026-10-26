import { describe, expect, it } from 'vitest';
import type { TemperatureReading } from '../data/mockData';
import { buildColdChainReport, coldChainObservationResult, coldChainReportDates, type ColdChainReportInput } from './coldChainReport';
import { factoryTemperaturePoints, type MilkStorageStateEvent } from './factoryChecklist';
import { createColdChainPdf } from './coldChainPdf';

const stamp = '2026-10-26T18:00:00Z';
const reading = (changes: Partial<TemperatureReading> = {}): TemperatureReading => ({
  id: 'reading-1', location: 'Chiller', temperature: 3, targetMin: 0, targetMax: 5,
  inRange: true, recordedAt: '2026-10-26T08:00:00Z', recordedBy: 'sa', ...changes,
});
const emptyMilk = (): MilkStorageStateEvent[] => factoryTemperaturePoints.filter(p => p.section === 'milk').map(p => ({
  id: p.id, location: p.location, status: 'empty', recordedAt: '2026-10-25T08:00:00Z', recordedBy: 'kb',
}));
const input = (changes: Partial<ColdChainReportInput> = {}): ColdChainReportInput => ({
  from: '2026-10-26', to: '2026-10-26', generatedAt: stamp, generatedBy: 'sa', readings: [], events: [], checks: [], ...changes,
});

describe('Cold Chain PDF report data', () => {
  it('uses one No milk summary line when all storage points are explicitly empty', () => {
    const report = buildColdChainReport(input({ events: emptyMilk() }));
    const rows = report.tables[0].rows;
    expect(rows.filter(r => r[5] === 'No milk')).toEqual([['2026-10-26', 'Milk storage', '-', '-', '-', 'No milk']]);
    expect(rows).toHaveLength(6); // Three cold stores, two tanks, one No milk line.
    expect(rows.some(r => r[1] === 'BMC 1')).toBe(false);
  });
  it('does not assume No milk when storage status has never been confirmed', () => {
    const rows = buildColdChainReport(input()).tables[0].rows;
    expect(rows.filter(r => r[5] === 'Storage status not confirmed')).toHaveLength(8);
    expect(rows.some(r => r.includes('No milk'))).toBe(false);
  });
  it('does not hide earlier milk activity when a vessel is later emptied', () => {
    const report = buildColdChainReport(input({ events: [...emptyMilk(),
      { id: 'loaded', location: 'Silo', status: 'milk_present', recordedAt: '2026-10-26T06:00:00Z', recordedBy: 'sa' },
      { id: 'emptied', location: 'Silo', status: 'empty', recordedAt: '2026-10-26T09:00:00Z', recordedBy: 'sa' },
    ], readings: [reading({ location: 'Silo', coldChainStorageReading: true, milkTemperature: 4, targetMin: 2, targetMax: 6 })] }));
    expect(report.tables[0].rows.find(r => r[1] === 'Silo')?.[5]).toContain('earlier activity retained');
    expect(report.tables[0].rows.some(r => r[5] === 'No milk')).toBe(false);
    expect(report.tables[1].rows).toHaveLength(1);
  });
  it('keeps partial empty status together and groups bulk No milk status updates', () => {
    const events = emptyMilk().map(e => ({ ...e, recordedAt: '2026-10-26T08:00:00Z' }));
    const report = buildColdChainReport(input({ events }));
    expect(report.tables[2].rows).toHaveLength(1);
    expect(report.tables[2].rows[0][1]).toBe('All milk storage');
    expect(report.tables[2].rows[0][2]).toBe('No milk');
    const partial = buildColdChainReport(input({ events: events.slice(0, 3) }));
    expect(partial.tables[0].rows.filter(r => r[5] === 'No milk in listed vessels')).toHaveLength(1);
  });
  it('counts distinct observations and does not count air-only checks as milk readings', () => {
    const r = reading();
    const report = buildColdChainReport(input({ readings: [r, r, reading({ id: 'r2', temperature: 4 }), reading({ id: 'air', location: 'Truck', coldChainStorageReading: true, storageTemperature: 3 })] }));
    expect(report.observationCount).toBe(3);
    expect(report.tables[0].rows.find(r => r[1] === 'Chiller')?.[2]).toBe('2/2');
    expect(report.tables[0].rows.find(r => r[1].startsWith('Truck'))?.[2]).toBe('0/2');
    expect(report.tables[1].rows.find(r => r[1] === 'Truck')?.[5]).toContain('Not assessed');
  });
  it('uses stored limits, accepts zero, and keeps upper-only limits distinct', () => {
    expect(coldChainObservationResult(reading({ temperature: 0 }))).toBe('Within range');
    expect(coldChainObservationResult(reading({ temperature: -2 }))).toBe('EXCURSION');
    expect(coldChainObservationResult(reading({ temperature: -2, upperLimitOnly: true }))).toBe('Within range');
    expect(coldChainObservationResult(reading({ rangeNotConfigured: true }))).toContain('Not assessed');
    expect(coldChainObservationResult(reading({ temperature: 6, inRange: true }))).toBe('EXCURSION');
  });
  it('applies SAST date boundaries and excludes observations after the snapshot', () => {
    const report = buildColdChainReport(input({ readings: [reading({ recordedAt: '2026-10-25T22:30:00Z' }), reading({ id: 'future', recordedAt: '2026-10-26T19:00:00Z' })] }));
    expect(report.observationCount).toBe(1);
    expect(report.tables[1].rows[0][0]).toContain('26 Oct 2026, 00:30:00 SAST');
  });
  it('validates date ranges and reports invalid legacy timestamps without inventing dates', () => {
    expect(() => coldChainReportDates('2026-02-30', '2026-03-01', '2026-10-26')).toThrow();
    expect(() => coldChainReportDates('2026-10-02', '2026-10-01', '2026-10-26')).toThrow();
    expect(() => coldChainReportDates('2026-09-01', '2026-10-26', '2026-10-26')).toThrow('31 days');
    expect(() => coldChainReportDates('2026-10-26', '2026-10-27', '2026-10-26')).toThrow('future');
    const report = buildColdChainReport(input({ readings: [reading({ recordedAt: 'bad' })] }));
    expect(report.observationCount).toBe(0);
    expect(report.warnings[0]).toContain('invalid timestamp');
  });
  it('includes checklist omissions and notes without inventing corrective actions', () => {
    const report = buildColdChainReport(input({ checks: [{ id: 'check', check_date: '2026-10-26', status: 'not_completed', recorded_at: stamp,
      recorded_by: 'id', recorded_by_name: 'sa', payload: { locks: {}, corridorReasons: [], temperatures: {}, missedReason: 'Factory closed', notes: 'Maintenance day' } }] }));
    expect(report.tables[3].rows[0][3]).toContain('Factory closed\nMaintenance day');
    expect(report.tables[3].alertRows).toEqual([0]);
  });
  it('generates a real multipage PDF including all ledger rows', () => {
    const report = buildColdChainReport(input({ events: emptyMilk(), readings: Array.from({ length: 100 }, (_, i) => reading({ id: `observation-${i}`, recordedBy: 'Long supervisor name for wrapping verification', milkLotCode: '111026' })) }));
    const pdf = createColdChainPdf(report);
    expect(pdf.getNumberOfPages()).toBeGreaterThan(5);
    const contents = pdf.output();
    expect(contents).toMatch(/^%PDF-/);
    expect(contents).toContain('observation-99');
    expect(contents).toContain('No milk');
  });
});
