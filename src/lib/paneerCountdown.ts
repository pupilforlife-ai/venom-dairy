import type { ProductionRound } from '../data/mockData';

export function paneerCountdownDeadline(round: Pick<ProductionRound, 'status' | 'pressingStartedAt' | 'coolingStartedAt' | 'coolingLocation' | 'restingStartedAt'>): number | null {
  let startedAt: string | undefined, seconds = 0;
  if (round.status === 'pressing') { startedAt = round.pressingStartedAt; seconds = 1800; }
  if (round.status === 'cooling' && round.coolingLocation) { startedAt = round.coolingStartedAt; seconds = round.coolingLocation === 'tank' ? 5400 : 7200; }
  if (round.status === 'resting') { startedAt = round.restingStartedAt; seconds = 5400; }
  const start = startedAt ? Date.parse(startedAt) : NaN;
  return Number.isFinite(start) ? start + seconds * 1000 : null;
}

export function remainingCountdownSeconds(deadline: number | null, now: number): number {
  return deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function formatCountdownTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
}
