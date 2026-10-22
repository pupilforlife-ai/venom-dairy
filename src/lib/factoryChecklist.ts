import type { TemperatureReading } from '../data/mockData';

export const FACTORY_CHECKLIST_START_DATE = '2026-10-22';
export const factoryLockPoints = [
  { id: 'front_door', label: 'Front door', kind: 'lock' },
  { id: 'front_shutters', label: 'Front shutters', kind: 'lock' },
  { id: 'rear_shutters', label: 'Rear shutters', kind: 'lock' },
  { id: 'containers', label: 'Containers', kind: 'lock' },
  { id: 'boiler_room', label: 'Boiler room', kind: 'power' },
  { id: 'factory_lights', label: 'Factory lights', kind: 'power' },
  { id: 'upstairs_lights', label: 'Upstairs lights', kind: 'power' },
  { id: 'kettle_room_lights', label: 'Kettle room lights', kind: 'power' },
  { id: 'kitchen_lights', label: 'Kitchen lights', kind: 'power' },
  { id: 'corridor_lights', label: 'Factory corridor lights', kind: 'power' },
] as const;
export const corridorNightShiftReasons = ['Naans', 'Paneer', 'Frying', 'Milk transfer/receiving'] as const;
export const missedFactoryCheckReasons = ['Weekend closure', 'Public holiday', 'Factory closed', 'Checklist not completed', 'Other'] as const;

export const factoryTemperaturePoints = [
  { id: 'chiller', label: 'Chiller', location: 'Chiller', section: 'cold', min: 0, max: 5 },
  { id: 'dairy_container', label: 'Dairy container', location: 'Dairy Container (Intermediate Freezer)', section: 'cold', min: -25, max: -10 },
  { id: 'coldroom', label: 'Coldroom', location: 'Coldroom', section: 'cold', min: -25, max: -10 },
  { id: 'silo', label: 'Silo', location: 'Silo', section: 'milk', min: 2, max: 6 },
  { id: 'bmc1', label: 'BMC 1', location: 'BMC1', section: 'milk', min: 2, max: 6 },
  { id: 'bmc2', label: 'BMC 2', location: 'BMC2', section: 'milk', min: 2, max: 6 },
  { id: 'bmc3', label: 'BMC 3', location: 'BMC3', section: 'milk', min: 2, max: 6 },
  { id: 'truck', label: 'Truck — milk temperature', location: 'Truck', section: 'milk', min: 2, max: 6 },
  { id: 'milk_coldroom', label: 'Coldroom — milk temperature', location: 'Milk Coldroom', section: 'milk', min: 2, max: 6 },
  { id: 'silo_cooling_tank', label: 'Silo cooling tank', location: 'Silo Cooling Tank', section: 'cooling', min: null, max: 5 },
  { id: 'paneer_cooling_tank', label: 'Paneer cooling tank', location: 'Paneer Cooling Tank', section: 'cooling', min: null, max: 6 },
] as const;

export type FactoryTemperaturePoint = typeof factoryTemperaturePoints[number];
export function factoryTemperatureInRange(point: FactoryTemperaturePoint, value: number): boolean | undefined {
  if (point.min === null && point.max === null) return undefined;
  return Number.isFinite(value) && (point.min === null || value >= point.min) && (point.max === null || value <= point.max);
}
export function factoryTemperatureTarget(point: FactoryTemperaturePoint) {
  return point.min === null ? point.max === null ? 'Limits not configured' : `At or below ${point.max}°C` : `${point.min}–${point.max}°C`;
}
export type FactoryLockAnswer = 'locked' | 'off' | 'night_shift';
export interface FactoryTemperatureAnswer {
  status: '' | 'active' | 'empty';
  temperature?: number;
  existingReadingId?: string;
  readingId?: string;
  observedAt?: string;
  recordedBy?: string;
  inRange?: boolean;
  targetLabel?: string;
  milkLotCode?: string;
}
export interface FactoryCheckPayload {
  scope?: 'all' | 'locks' | 'temperatures';
  locks: Record<string, FactoryLockAnswer | ''>;
  corridorReasons: string[];
  temperatures: Record<string, FactoryTemperatureAnswer>;
  missedReason?: string;
  notes?: string;
}

export function markAllMilkStorageEmpty(payload: FactoryCheckPayload): FactoryCheckPayload {
  const temperatures = { ...payload.temperatures };
  for (const point of factoryTemperaturePoints) {
    if (point.section === 'milk') temperatures[point.id] = { status: 'empty' };
  }
  return { ...payload, temperatures };
}
export interface FactoryCheckRecord {
  id: string;
  check_date: string;
  status: 'completed' | 'not_completed';
  payload: FactoryCheckPayload;
  recorded_at: string;
  recorded_by: string;
  recorded_by_name: string;
}
export interface MilkStorageStateEvent {
  id: string;
  location: string;
  status: 'milk_present' | 'in_use' | 'empty';
  milkLotCode?: string;
  recordedAt: string;
  recordedBy: string;
}

export function factoryDate(value: Date | string = new Date()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function factoryCheckDates(today: string, start = FACTORY_CHECKLIST_START_DATE) {
  const result: string[] = [];
  for (let date = new Date(`${start}T12:00:00Z`); date.toISOString().slice(0, 10) <= today; date.setUTCDate(date.getUTCDate() + 1)) {
    result.push(date.toISOString().slice(0, 10));
  }
  return result.reverse();
}

export function latestFactoryChecks(records: FactoryCheckRecord[]) {
  const byDate = new Map<string, FactoryCheckRecord>();
  records.filter(record => record.payload.scope !== 'temperatures').sort((a, b) => a.recorded_at.localeCompare(b.recorded_at)).forEach(record => byDate.set(record.check_date, record));
  return byDate;
}

// Count actual distinct Cold Chain observations, not the number of sign-offs.
// Linking one observation in two forms still counts as one temperature check.
export function factoryTemperatureProgress(date: string, readings: TemperatureReading[], events: MilkStorageStateEvent[]) {
  return factoryTemperaturePoints.map(point => {
    const observations = readings.filter(reading => reading.location === point.location
      && factoryDate(reading.recordedAt) === date && Number.isFinite(factoryReadingValue(point, reading)));
    const count = new Set(observations.map(reading => reading.id)).size;
    const latestEvent = events.filter(event => event.location === point.location && factoryDate(event.recordedAt) <= date)
      .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))[0];
    const activity: 'active' | 'empty' | undefined = point.section === 'cold' ? 'active' : latestEvent
      ? latestEvent.status === 'empty' ? 'empty' : 'active'
      : point.section === 'cooling' && count > 0 ? 'active' : undefined;
    return { point, count, activity, complete: activity === 'empty' || activity === 'active' && count >= 2 };
  });
}

export function factoryReadingValue(point: FactoryTemperaturePoint, reading: TemperatureReading) {
  return point.section === 'milk' ? reading.milkTemperature : reading.temperature;
}

export function validateFactoryCheck(payload: FactoryCheckPayload, status: FactoryCheckRecord['status']) {
  if (status === 'not_completed') {
    if (!missedFactoryCheckReasons.some(reason => reason === payload.missedReason)) return 'Select the reason this day’s checklist was not completed.';
    if (['Other', 'Checklist not completed'].includes(payload.missedReason!) && !payload.notes?.trim()) return 'Explain why the checklist was not completed.';
    return null;
  }
  if (payload.scope && !['all', 'locks', 'temperatures'].includes(payload.scope)) return 'Choose a valid checklist section.';
  if (payload.scope !== 'temperatures') {
    for (const point of factoryLockPoints) {
      if (![(point.kind === 'lock' ? 'locked' : 'off'), 'night_shift'].includes(payload.locks[point.id])) return `Select a status for ${point.label}.`;
    }
    if (payload.locks.corridor_lights === 'night_shift'
      && !payload.corridorReasons.some(reason => corridorNightShiftReasons.some(option => option === reason))) return 'Select why the factory corridor lights were left on.';
  }
  if (payload.scope === 'locks') return null;
  for (const point of factoryTemperaturePoints) {
    const answer = payload.temperatures[point.id];
    if (!answer || !['active', 'empty'].includes(answer.status) || (point.section === 'cold' && answer.status !== 'active')) return `Confirm whether ${point.label} is in use.`;
    if (answer.status === 'active' && !answer.existingReadingId && !Number.isFinite(answer.temperature)) return `Record the temperature for ${point.label}.`;
  }
  return null;
}
