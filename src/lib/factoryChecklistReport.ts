import {
  factoryLockPoints, factoryTemperaturePoints, formatFactoryRecordedAt,
  type FactoryCheckRecord,
} from './factoryChecklist';

export interface ChecklistObservation {
  label: string;
  value: string;
  result: string;
  target: string;
  observedAt: string;
  recordedBy: string;
  milkLotCode: string;
  readingId: string;
  excursion: boolean;
}

// This takes ONE saved submission, never the current live temperature list.
// Historical values, limits, actors and observation times remain as recorded.
export function factoryChecklistObservations(record: FactoryCheckRecord): ChecklistObservation[] {
  if (record.status !== 'completed' || record.payload.scope === 'locks') return [];
  const rows: ChecklistObservation[] = [];
  const emptyMilk: string[] = [];
  for (const point of factoryTemperaturePoints) {
    const answer = record.payload.temperatures[point.id];
    if (point.section === 'milk' && answer?.status === 'empty') {
      emptyMilk.push(point.label);
      continue;
    }
    const active = answer?.status === 'active';
    rows.push({
      label: point.label,
      value: answer?.status === 'empty' ? 'Empty / not in use' : active && Number.isFinite(answer.temperature) ? `${answer.temperature}°C` : 'Not recorded',
      result: active ? answer.inRange === false ? 'OUT OF RANGE' : answer.inRange === true ? 'In range' : 'Range result not recorded' : '',
      target: active ? answer.targetLabel || 'Recorded limits unavailable' : '',
      observedAt: active ? answer.observedAt ? formatFactoryRecordedAt(answer.observedAt) : 'Time unavailable' : '',
      recordedBy: active ? answer.recordedBy || 'Name unavailable' : '',
      milkLotCode: active ? answer.milkLotCode || '' : '',
      readingId: active ? answer.readingId || answer.existingReadingId || '' : '',
      excursion: active && answer.inRange === false,
    });
  }
  if (emptyMilk.length) {
    const allEmpty = emptyMilk.length === factoryTemperaturePoints.filter(point => point.section === 'milk').length;
    rows.push({ label: allEmpty ? 'Milk storage' : `Empty milk storage: ${emptyMilk.join(', ')}`, value: 'No milk',
      result: '', target: '', observedAt: '', recordedBy: '', milkLotCode: '', readingId: '', excursion: false });
  }
  return rows;
}

export function factoryChecklistLockRows(record: FactoryCheckRecord) {
  if (record.status !== 'completed' || record.payload.scope === 'temperatures') return [];
  return factoryLockPoints.map(point => {
    const answer = record.payload.locks[point.id];
    const value = answer === 'night_shift' ? point.kind === 'lock' ? 'Left open - night shift' : 'On - night shift'
      : answer === 'locked' ? 'Locked' : answer === 'off' ? 'Off' : 'Not recorded';
    return [point.label, point.id === 'corridor_lights' && answer === 'night_shift' ? `${value}\n${record.payload.corridorReasons.join(', ')}` : value];
  });
}

export function factoryChecklistPdfFilename(record: FactoryCheckRecord) {
  const date = new Date(record.recorded_at);
  const time = Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(date).replace(/:/g, '') : 'time-unavailable';
  const id = record.id.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 12) || 'record';
  return `vejoy-checklist-${record.check_date.replace(/[^0-9-]/g, '')}-${time}-SAST-${id}.pdf`;
}
