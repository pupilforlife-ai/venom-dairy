import { describe, expect, it } from 'vitest';
import { factoryCheckDates, factoryDate, formatFactoryRecordedAt, factoryLockPoints, factoryTemperaturePoints, factoryTemperatureInRange, factoryTemperatureProgress, latestFactoryChecks, validateFactoryCheck, markAllMilkStorageEmpty, type FactoryCheckPayload, type FactoryCheckRecord } from './factoryChecklist';
import type { TemperatureReading } from '../data/mockData';

function validPayload(): FactoryCheckPayload {
  return {
    locks: Object.fromEntries(factoryLockPoints.map(point => [point.id, point.kind === 'lock' ? 'locked' : 'off'])),
    corridorReasons: [],
    temperatures: Object.fromEntries(factoryTemperaturePoints.map(point => [point.id, { status: point.section === 'cold' ? 'active' : 'empty', ...(point.section === 'cold' ? { temperature: 0 } : {}) }])),
  };
}

describe('daily factory checklist', () => {
  it('displays the stored recording timestamp with seconds and explicit SAST, independent of device timezone', () => {
    expect(formatFactoryRecordedAt('2026-10-22T17:14:32Z')).toBe('22 Oct 2026, 19:14:32 SAST');
    expect(formatFactoryRecordedAt('2026-10-22T22:30:05Z')).toBe('23 Oct 2026, 00:30:05 SAST');
    expect(formatFactoryRecordedAt('invalid')).toBe('Timestamp unavailable');
  });
  it('marks all six milk-storage points empty without altering fridge readings, cooling tanks or locks', () => {
    const payload = validPayload();
    for (const point of factoryTemperaturePoints.filter(point => point.section === 'milk')) {
      payload.temperatures[point.id] = { status: 'active', temperature: 4, existingReadingId: 'old-reading', milkLotCode: '111026' };
    }
    payload.temperatures.silo_cooling_tank = { status: 'active', temperature: 3 };
    payload.temperatures.paneer_cooling_tank = { status: 'active', temperature: 5 };
    const updated = markAllMilkStorageEmpty(payload);
    expect(factoryTemperaturePoints.filter(point => point.section === 'milk')).toHaveLength(6);
    for (const point of factoryTemperaturePoints) {
      expect(updated.temperatures[point.id]).toEqual(point.section === 'milk' ? { status: 'empty' } : payload.temperatures[point.id]);
    }
    expect(updated.locks).toEqual(payload.locks);
    expect(payload.temperatures.silo.status).toBe('active');
    expect(validateFactoryCheck(updated, 'completed')).toBeNull();
  });
  it('uses South African calendar dates across UTC midnight and enumerates missing days without inventing closures', () => {
    expect(factoryDate('2026-10-22T22:30:00Z')).toBe('2026-10-23');
    expect(factoryDate('malformed legacy timestamp')).toBe('');
    expect(factoryCheckDates('2026-10-25')).toEqual(['2026-10-25', '2026-10-24', '2026-10-23', '2026-10-22']);
    expect(factoryCheckDates('2026-10-21')).toEqual([]);
  });
  it('requires all ten lock/power answers, including boiler room off/on', () => {
    const payload = validPayload();
    expect(validateFactoryCheck(payload, 'completed')).toBeNull();
    payload.locks.boiler_room = 'locked';
    expect(validateFactoryCheck(payload, 'completed')).toContain('Boiler room');
    delete payload.locks.front_door;
    expect(validateFactoryCheck(payload, 'completed')).toContain('Front door');
  });
  it('requires a specific night-shift reason for corridor lights', () => {
    const payload = validPayload();
    payload.locks.corridor_lights = 'night_shift';
    expect(validateFactoryCheck(payload, 'completed')).toContain('corridor');
    payload.corridorReasons = ['Naans', 'Milk transfer/receiving'];
    expect(validateFactoryCheck(payload, 'completed')).toBeNull();
  });
  it('distinguishes zero temperature from blank, skips empty milk vessels, and requires active vessel temperatures', () => {
    const payload = validPayload();
    expect(validateFactoryCheck(payload, 'completed')).toBeNull();
    payload.temperatures.silo = { status: 'active' };
    expect(validateFactoryCheck(payload, 'completed')).toContain('Silo');
    payload.temperatures.silo.temperature = 0;
    // Excursions are recorded, never hidden by rejecting the observation.
    expect(validateFactoryCheck(payload, 'completed')).toBeNull();
    payload.temperatures.chiller.temperature = Number.NaN;
    expect(validateFactoryCheck(payload, 'completed')).toContain('Chiller');
  });
  it('can reference an existing observation instead of asking for a duplicate reading', () => {
    const payload = validPayload();
    payload.temperatures.chiller = { status: 'active', existingReadingId: 'today-reading' };
    expect(validateFactoryCheck(payload, 'completed')).toBeNull();
    const siloTank = factoryTemperaturePoints.find(point => point.id === 'silo_cooling_tank')!;
    expect(factoryTemperatureInRange(siloTank, 5)).toBe(true);
    expect(factoryTemperatureInRange(siloTank, 5.1)).toBe(false);
    expect(factoryTemperatureInRange(siloTank, 0)).toBe(true);
    const paneerTank = factoryTemperaturePoints.find(point => point.id === 'paneer_cooling_tank')!;
    expect(factoryTemperatureInRange(paneerTank, 6)).toBe(true);
    expect(factoryTemperatureInRange(paneerTank, 6.1)).toBe(false);
  });
  it('records explicit reasons for missing days and requires explanation for unexplained omissions', () => {
    const payload = validPayload();
    expect(validateFactoryCheck(payload, 'not_completed')).toContain('reason');
    payload.missedReason = 'Weekend closure';
    expect(validateFactoryCheck(payload, 'not_completed')).toBeNull();
    payload.missedReason = 'Checklist not completed';
    expect(validateFactoryCheck(payload, 'not_completed')).toContain('Explain');
    payload.notes = 'Administrator left before completing the inspection.';
    expect(validateFactoryCheck(payload, 'not_completed')).toBeNull();
  });
  it('retains history while using the newest submission as the daily status', () => {
    const base = { id: 'a', check_date: '2026-10-22', status: 'not_completed', payload: validPayload(), recorded_at: '2026-10-22T16:00:00Z', recorded_by: 'admin-id', recorded_by_name: 'Admin' } as FactoryCheckRecord;
    const corrected = { ...base, id: 'b', status: 'completed', recorded_at: '2026-10-22T17:00:00Z' } as FactoryCheckRecord;
    const records = [corrected, base];
    expect(latestFactoryChecks(records).get(base.check_date)?.id).toBe('b');
    expect(records).toHaveLength(2);
  });

  it('allows independent temperature rounds without asking for locks again and independent lock checks without temperatures', () => {
    const temperatureCheck = { ...validPayload(), scope: 'temperatures' as const, locks: {} };
    expect(validateFactoryCheck(temperatureCheck, 'completed')).toBeNull();
    const lockCheck = { ...validPayload(), scope: 'locks' as const, temperatures: {} };
    expect(validateFactoryCheck(lockCheck, 'completed')).toBeNull();
  });

  it('requires two distinct observations per location, including valid zero temperatures, and ignores earlier dates', () => {
    const reading: TemperatureReading = { id: 'one', location: 'Chiller', temperature: 0, targetMin: 0, targetMax: 5, recordedAt: '2026-10-22T06:00:00Z', recordedBy: 'Admin', inRange: true };
    const progress = (readings: TemperatureReading[]) => factoryTemperatureProgress('2026-10-22', readings, []).find(row => row.point.id === 'chiller')!;
    expect(progress([]).count).toBe(0);
    expect(progress([reading]).complete).toBe(false);
    expect(progress([reading, reading]).count).toBe(1);
    expect(progress([reading, { ...reading, id: 'yesterday', recordedAt: '2026-10-21T12:00:00Z' }]).count).toBe(1);
    expect(progress([reading, { ...reading, id: 'two', recordedAt: '2026-10-22T16:00:00Z' }]).complete).toBe(true);
  });

  it('keeps counts per vessel, excludes air-only checks from milk counts, and exempts vessels explicitly emptied', () => {
    const reading: TemperatureReading = { id: 'milk-one', location: 'Truck', temperature: 4, targetMin: 2, targetMax: 6, coldChainStorageReading: true, storageTemperature: 4, recordedAt: '2026-10-22T08:00:00Z', recordedBy: 'Admin', inRange: true };
    const events = [{ id: 'event', location: 'Truck', status: 'milk_present' as const, recordedAt: '2026-10-22T06:00:00Z', recordedBy: 'Admin' }];
    expect(factoryTemperatureProgress('2026-10-22', [reading], events).find(row => row.point.id === 'truck')?.count).toBe(0);
    const milkReading = { ...reading, milkTemperature: 4 };
    const result = factoryTemperatureProgress('2026-10-22', [milkReading], events);
    expect(result.find(row => row.point.id === 'truck')?.count).toBe(1);
    expect(result.find(row => row.point.id === 'bmc1')?.count).toBe(0);
    expect(result.find(row => row.point.id === 'truck')?.complete).toBe(false);
    expect(factoryTemperatureProgress('2026-10-22', [milkReading], [...events, { ...events[0], id: 'empty', status: 'empty', recordedAt: '2026-10-22T10:00:00Z' }]).find(row => row.point.id === 'truck')?.complete).toBe(true);
  });

  it('temperature-only submissions do not replace the daily locks sign-off', () => {
    const base = { id: 'locks', check_date: '2026-10-22', status: 'completed', payload: { ...validPayload(), scope: 'locks' }, recorded_at: '2026-10-22T16:00:00Z', recorded_by: 'admin-id', recorded_by_name: 'Admin' } as FactoryCheckRecord;
    const temperatures = { ...base, id: 'temperatures', payload: { ...validPayload(), scope: 'temperatures' }, recorded_at: '2026-10-22T17:00:00Z' } as FactoryCheckRecord;
    expect(latestFactoryChecks([base, temperatures]).get(base.check_date)?.id).toBe('locks');
  });

  it('uses shared cooling-tank usage state, retaining a legacy-reading fallback until a tank is explicitly emptied', () => {
    const reading: TemperatureReading = { id: 'tank-one', location: 'Silo Cooling Tank', temperature: 4, targetMin: 0, targetMax: 5, upperLimitOnly: true, recordedAt: '2026-10-22T08:00:00Z', recordedBy: 'Admin', inRange: true };
    const progress = factoryTemperatureProgress('2026-10-22', [reading], []).find(row => row.point.id === 'silo_cooling_tank')!;
    expect(progress.activity).toBe('active');
    expect(progress.complete).toBe(false);
    const events = [{ id: 'empty-tank', location: reading.location, status: 'empty' as const, recordedAt: '2026-10-22T09:00:00Z', recordedBy: 'Admin' }];
    expect(factoryTemperatureProgress('2026-10-22', [reading], events).find(row => row.point.id === 'silo_cooling_tank')?.complete).toBe(true);
    expect(factoryTemperatureProgress('2026-10-21', [reading], events).find(row => row.point.id === 'silo_cooling_tank')?.activity).toBeUndefined();
  });
});
