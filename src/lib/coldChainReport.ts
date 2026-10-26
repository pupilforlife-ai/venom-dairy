import type { TemperatureReading } from '../data/mockData';
import { temperatureTargetLabel } from './coldChain';
import {
  factoryDate, factoryTemperaturePoints, factoryTemperatureProgress, formatFactoryRecordedAt,
  type FactoryCheckRecord, type MilkStorageStateEvent,
} from './factoryChecklist';

export interface ColdChainReportInput {
  from: string;
  to: string;
  generatedAt: string;
  generatedBy: string;
  readings: TemperatureReading[];
  events: MilkStorageStateEvent[];
  checks: FactoryCheckRecord[];
}
export interface ReportTable {
  title: string;
  headers: string[];
  widths: number[];
  rows: string[][];
  alertRows: number[];
}
export interface ColdChainReport {
  from: string;
  to: string;
  generatedAt: string;
  generatedBy: string;
  observationCount: number;
  excursions: number;
  warnings: string[];
  tables: ReportTable[];
}

export function coldChainReportDates(from: string, to: string, today = factoryDate()) {
  const valid = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(Date.parse(`${date}T12:00:00Z`))
    && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
  if (!valid(from) || !valid(to) || from > to) throw new Error('Choose a valid start and end date.');
  if (to > today) throw new Error('The report cannot include future dates.');
  const days = Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1;
  if (days > 31) throw new Error('Choose up to 31 days per report.');
  return Array.from({ length: days }, (_, i) => new Date(Date.parse(`${from}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));
}

const number = (value: number | undefined) => Number.isFinite(value) ? `${Number(value!.toFixed(2))}` : 'Not recorded';
const statusLabel = (event: MilkStorageStateEvent) => event.status === 'empty' ? 'Empty' : event.status === 'milk_present' ? 'Milk present' : 'In use';
const milkLocations = new Set(factoryTemperaturePoints.filter(p => p.section === 'milk').map(p => p.location as string));

// Calculate from the observation's stored limits, not a generic air/milk limit.
// Unknown limits / missing milk measurements must never become a green OK.
export function coldChainObservationResult(reading: TemperatureReading) {
  const value = reading.coldChainStorageReading ? reading.milkTemperature : reading.temperature;
  if (!Number.isFinite(value)) return 'Not assessed: temperature missing';
  if (reading.rangeNotConfigured || !Number.isFinite(reading.targetMax)
    || !reading.upperLimitOnly && !Number.isFinite(reading.targetMin)) return 'Not assessed: limits missing';
  return value! <= reading.targetMax && (reading.upperLimitOnly || value! >= reading.targetMin) ? 'Within range' : 'EXCURSION';
}

export function buildColdChainReport(input: ColdChainReportInput): ColdChainReport {
  const dates = coldChainReportDates(input.from, input.to, factoryDate(input.generatedAt));
  const within = (stamp: string) => { const date = factoryDate(stamp); return date !== '' && date >= input.from && date <= input.to; };
  const warnings: string[] = [];
  const invalid = input.readings.filter(r => !factoryDate(r.recordedAt)).length + input.events.filter(e => !factoryDate(e.recordedAt)).length;
  if (invalid) warnings.push(`${invalid} record(s) have an invalid timestamp and cannot be assigned to a reporting date.`);
  // A linked observation repeated in multiple checklists is still one reading.
  const unique = new Map<string, TemperatureReading>();
  input.readings.forEach((r, index) => unique.set(r.id || `missing-id-${index}`, r));
  const allReadings = [...unique.values()].filter(r => Date.parse(r.recordedAt) <= Date.parse(input.generatedAt));
  const readings = allReadings.filter(r => within(r.recordedAt)).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  const events = input.events.filter(e => factoryDate(e.recordedAt) && Date.parse(e.recordedAt) <= Date.parse(input.generatedAt));
  const summary: ReportTable = { title: 'Daily observation summary', headers: ['Date (SAST)', 'Location / storage', 'Readings', 'Min °C', 'Max °C', 'Check coverage / status'], widths: [26, 57, 20, 20, 20, 130], rows: [], alertRows: [] };
  for (const date of dates) {
    const progress = factoryTemperatureProgress(date, allReadings, events);
    const emptyMilk: string[] = [];
    for (const row of progress) {
      const samples = readings.filter(r => factoryDate(r.recordedAt) === date && r.location === row.point.location);
      const values = samples.map(r => row.point.section === 'milk' ? r.milkTemperature : r.temperature).filter((v): v is number => Number.isFinite(v));
      const priorEvent = events.filter(e => e.location === row.point.location && factoryDate(e.recordedAt) < date).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0];
      const activeEarlier = priorEvent && priorEvent.status !== 'empty'
        || events.some(e => e.location === row.point.location && factoryDate(e.recordedAt) === date && e.status !== 'empty');
      // An end-of-day empty flag must not erase readings or earlier milk presence.
      if (row.point.section === 'milk' && row.activity === 'empty' && !samples.length && !activeEarlier) {
        emptyMilk.push(row.point.label);
        continue;
      }
      let status = row.activity === undefined ? 'Storage status not confirmed'
        : row.activity === 'empty' ? activeEarlier || samples.length ? 'Empty at last update; earlier activity retained' : 'Empty / not in use'
        : row.count >= 2 ? 'Two daily observations recorded' : `${2 - row.count} observation(s) not recorded`;
      if ((activeEarlier || samples.length) && row.activity === 'empty' && row.count < 2) status += `; ${row.count}/2 observations while in use`;
      const excursions = samples.filter(r => coldChainObservationResult(r) === 'EXCURSION').length;
      if (excursions) status += `; ${excursions} EXCURSION(S)`;
      if (row.activity === undefined || row.activity === 'active' && row.count < 2 || excursions || (activeEarlier || samples.length > 0) && row.count < 2) summary.alertRows.push(summary.rows.length);
      summary.rows.push([date, row.point.label, `${row.count}/2`, values.length ? number(Math.min(...values)) : '-', values.length ? number(Math.max(...values)) : '-', status]);
    }
    if (emptyMilk.length) summary.rows.push([date, emptyMilk.length === milkLocations.size ? 'Milk storage' : `Empty milk storage: ${emptyMilk.join(', ')}`, '-', '-', '-', emptyMilk.length === milkLocations.size ? 'No milk' : 'No milk in listed vessels']);
  }
  const observations: ReportTable = {
    title: 'Recorded observations', headers: ['Observed at (SAST)', 'Location', 'Temp / milk °C', 'Storage / air °C', 'Recorded target', 'Result', 'Recorded by', 'Lot / record reference'],
    widths: [35, 38, 21, 23, 30, 30, 32, 64], rows: [], alertRows: [],
  };
  for (const reading of readings) {
    const result = coldChainObservationResult(reading);
    if (result !== 'Within range') observations.alertRows.push(observations.rows.length);
    observations.rows.push([
      formatFactoryRecordedAt(reading.recordedAt), reading.location,
      number(reading.coldChainStorageReading ? reading.milkTemperature : reading.temperature),
      reading.coldChainStorageReading ? number(reading.storageTemperature) : '-', temperatureTargetLabel(reading), result,
      reading.recordedBy || 'Not recorded', `${reading.milkLotCode ? `Lot ${reading.milkLotCode}\n` : ''}Reading: ${reading.id || 'ID unavailable'}${reading.factoryChecklistId ? `\nChecklist: ${reading.factoryChecklistId}` : ''}`,
    ]);
  }
  const states: ReportTable = { title: 'Storage status changes', headers: ['Recorded at (SAST)', 'Location / storage', 'Status', 'Recorded by', 'Lot'], widths: [40, 90, 57, 50, 36], rows: [], alertRows: [] };
  const stateRows: Array<{ stamp: string; cells: string[] }> = [];
  // Consolidate bulk No milk / empty actions, retaining the actual actor/time.
  const emptyGroups = new Map<string, MilkStorageStateEvent[]>();
  for (const event of events.filter(e => within(e.recordedAt)).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))) {
    if (event.status === 'empty' && milkLocations.has(event.location)) {
      const key = `${event.recordedAt}|${event.recordedBy}`;
      emptyGroups.set(key, [...(emptyGroups.get(key) || []), event]);
    } else stateRows.push({ stamp: event.recordedAt, cells: [formatFactoryRecordedAt(event.recordedAt), event.location, statusLabel(event), event.recordedBy || 'Not recorded', event.milkLotCode || '-'] });
  }
  for (const group of emptyGroups.values()) {
    const locations = [...new Set(group.map(e => e.location))];
    stateRows.push({ stamp: group[0].recordedAt, cells: [formatFactoryRecordedAt(group[0].recordedAt), locations.length === milkLocations.size ? 'All milk storage' : locations.join(', '), 'No milk', group[0].recordedBy || 'Not recorded', '-'] });
  }
  states.rows = stateRows.sort((a, b) => a.stamp.localeCompare(b.stamp)).map(row => row.cells);
  const checks: ReportTable = { title: 'Checklist submissions / recorded notes', headers: ['Check date', 'Recorded at (SAST)', 'Recorded by', 'Temperature check / omission / notes'], widths: [26, 40, 45, 162], rows: [], alertRows: [] };
  input.checks.filter(c => c.check_date >= input.from && c.check_date <= input.to && c.payload.scope !== 'locks' && Date.parse(c.recorded_at) <= Date.parse(input.generatedAt))
    .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at)).forEach(check => {
      if (check.status === 'not_completed') checks.alertRows.push(checks.rows.length);
      checks.rows.push([check.check_date, formatFactoryRecordedAt(check.recorded_at), check.recorded_by_name || 'Not recorded',
        [check.status === 'not_completed' ? `Not completed: ${check.payload.missedReason || 'Reason not recorded'}` : 'Temperature checklist submitted (not a substitute for two distinct observations)', check.payload.notes].filter(Boolean).join('\n')]);
    });
  warnings.push('Two distinct observations per South African calendar day are expected for locations in use. Counts do not prove that checks were spaced morning/evening.');
  warnings.push('Empty status is carried forward from the last recorded storage update; it is not a new physical inspection. Earlier activity is retained. Unconfirmed status is not treated as No milk.');
  warnings.push('Truck / milk-coldroom air readings are separate from milk readings and do not count as milk observations. Additional locations appear in the observation ledger; daily coverage is assessed for the configured factory checklist points only.');
  warnings.push('Notes are reproduced only where recorded in a checklist. No corrective action or missing reading is inferred. This is a read-only snapshot, not an approval or sign-off.');
  return { from: input.from, to: input.to, generatedAt: input.generatedAt, generatedBy: input.generatedBy, observationCount: readings.length,
    excursions: readings.filter(r => coldChainObservationResult(r) === 'EXCURSION').length, warnings, tables: [summary, observations, states, checks] };
}
