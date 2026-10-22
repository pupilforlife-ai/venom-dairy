import { describe, expect, it } from 'vitest';
import { factoryCheckDates, factoryDate, factoryLockPoints, factoryTemperaturePoints, factoryTemperatureInRange, latestFactoryChecks, validateFactoryCheck, type FactoryCheckPayload, type FactoryCheckRecord } from './factoryChecklist';

function validPayload(): FactoryCheckPayload {
  return {
    locks: Object.fromEntries(factoryLockPoints.map(point => [point.id, point.kind === 'lock' ? 'locked' : 'off'])),
    corridorReasons: [],
    temperatures: Object.fromEntries(factoryTemperaturePoints.map(point => [point.id, { status: point.section === 'cold' ? 'active' : 'empty', ...(point.section === 'cold' ? { temperature: 0 } : {}) }])),
  };
}

describe('daily factory checklist', () => {
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
});
