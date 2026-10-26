import { describe, expect, it } from 'vitest';
import { factoryLockPoints, factoryTemperaturePoints, type FactoryCheckRecord } from './factoryChecklist';
import { factoryChecklistLockRows, factoryChecklistObservations, factoryChecklistPdfFilename } from './factoryChecklistReport';
import { createFactoryChecklistPdf } from './factoryChecklistPdf';

const record = (): FactoryCheckRecord => ({
  id: 'checklist-morning', check_date: '2026-10-26', status: 'completed', recorded_at: '2026-10-26T06:12:30Z', recorded_by: 'owner-id', recorded_by_name: 'sa',
  payload: { scope: 'temperatures', locks: {}, corridorReasons: [], notes: 'Morning check only', temperatures: Object.fromEntries(factoryTemperaturePoints.map(point => [point.id, point.section === 'cold' ? {
    status: 'active', temperature: point.id === 'chiller' ? 3 : -18, targetLabel: point.id === 'chiller' ? '0–5°C' : '-25–-10°C', inRange: true,
    observedAt: '2026-10-26T05:45:00Z', recordedBy: 'kb', readingId: `morning-${point.id}`,
  } : { status: 'empty' }])) },
});

describe('one saved Dashboard checklist PDF', () => {
  it('exports only the selected morning or evening snapshot with distinct filenames', () => {
    const morning = record();
    const evening = structuredClone(morning);
    evening.id = 'checklist-evening'; evening.recorded_at = '2026-10-26T15:51:44Z'; evening.payload.notes = 'Evening check only';
    evening.payload.temperatures.chiller.temperature = 7;
    evening.payload.temperatures.chiller.inRange = false;
    expect(factoryChecklistObservations(morning)[0].value).toBe('3°C');
    expect(factoryChecklistObservations(evening)[0].value).toBe('7°C');
    expect(factoryChecklistPdfFilename(morning)).toContain('081230-SAST');
    expect(factoryChecklistPdfFilename(evening)).toContain('175144-SAST');
    expect(factoryChecklistPdfFilename(morning)).not.toBe(factoryChecklistPdfFilename(evening));
    const pdf = createFactoryChecklistPdf(morning).output();
    expect(pdf).toContain('Morning check only');
    expect(pdf).not.toContain('Evening check only');
    expect(pdf).not.toContain('checklist-evening');
  });
  it('preserves observation time and observer separately from checklist submission time and signer', () => {
    const source = record();
    const row = factoryChecklistObservations(source)[0];
    expect(row.observedAt).toBe('26 Oct 2026, 07:45:00 SAST');
    expect(row.recordedBy).toBe('kb');
    expect(row.readingId).toBe('morning-chiller');
    const pdf = createFactoryChecklistPdf(source).output();
    expect(pdf).toContain('08:12:30 SAST');
    expect(pdf).toContain('07:45:00 SAST');
    expect(pdf).toContain('Recorded by: sa');
  });
  it('shows a single No milk line for six empty milk-storage points', () => {
    const rows = factoryChecklistObservations(record());
    expect(rows.filter(row => row.value === 'No milk')).toHaveLength(1);
    expect(rows.find(row => row.value === 'No milk')?.label).toBe('Milk storage');
    expect(rows).toHaveLength(6);
  });
  it('retains active milk vessels and groups only empty ones', () => {
    const source = record();
    source.payload.temperatures.silo = { status: 'active', temperature: 6.2, inRange: false, targetLabel: '2–6°C', milkLotCode: '270926', observedAt: source.recorded_at, recordedBy: 'sa' };
    const rows = factoryChecklistObservations(source);
    expect(rows.find(row => row.label === 'Silo')).toMatchObject({ value: '6.2°C', result: 'OUT OF RANGE', excursion: true, milkLotCode: '270926' });
    expect(rows.find(row => row.value === 'No milk')?.label).toContain('Empty milk storage:');
  });
  it('does not fabricate missing legacy times, limits, names or empty status', () => {
    const source = record();
    source.payload.temperatures.chiller = { status: 'active', temperature: 0 };
    delete source.payload.temperatures.silo;
    const rows = factoryChecklistObservations(source);
    expect(rows[0]).toMatchObject({ value: '0°C', observedAt: 'Time unavailable', recordedBy: 'Name unavailable', target: 'Recorded limits unavailable', result: 'Range result not recorded' });
    expect(rows.find(row => row.label === 'Silo')?.value).toBe('Not recorded');
  });
  it('respects locks-only and omission submissions, including notes and night-shift reasons', () => {
    const source = record(); source.payload.scope = 'locks';
    source.payload.locks = Object.fromEntries(factoryLockPoints.map(point => [point.id, 'off']));
    source.payload.locks.front_door = '';
    source.payload.locks.corridor_lights = 'night_shift'; source.payload.corridorReasons = ['Naans'];
    expect(factoryChecklistObservations(source)).toEqual([]);
    expect(factoryChecklistLockRows(source)[0][1]).toBe('Not recorded');
    expect(factoryChecklistLockRows(source).find(row => row[0] === 'Factory corridor lights')?.[1]).toBe('On - night shift\nNaans');
    source.status = 'not_completed'; source.payload.missedReason = 'Factory closed';
    expect(factoryChecklistLockRows(source)).toEqual([]);
    const pdf = createFactoryChecklistPdf(source).output();
    expect(pdf).toContain('Factory closed');
    expect(pdf).not.toContain('Temperatures - this submission only');
  });
  it('creates a valid PDF without mutating its audit record and paginates long notes', () => {
    const source = record(); source.payload.notes = 'Long note for page-break verification. '.repeat(400);
    const before = JSON.stringify(source);
    const pdf = createFactoryChecklistPdf(source);
    expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
    expect(pdf.output()).toMatch(/^%PDF-/);
    expect(pdf.output()).toContain('morning-chiller');
    expect(JSON.stringify(source)).toBe(before);
  });
});
