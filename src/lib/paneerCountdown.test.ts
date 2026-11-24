import { describe, expect, it } from 'vitest';
import { paneerCountdownDeadline, remainingCountdownSeconds, formatCountdownTime } from './paneerCountdown';

const start = '2026-11-24T08:00:00Z', now = Date.parse(start);
describe('paneer countdowns use recorded stage times', () => {
  it('keeps pressing, tank/chiller cooling and resting durations unchanged', () => {
    for (const [status, field, location, seconds] of [
      ['pressing', 'pressingStartedAt', undefined, 1800],
      ['cooling', 'coolingStartedAt', 'tank', 5400],
      ['cooling', 'coolingStartedAt', 'chiller', 7200],
      ['resting', 'restingStartedAt', undefined, 5400],
    ] as const) {
      const deadline = paneerCountdownDeadline({ status, [field]: start, coolingLocation: location });
      expect(remainingCountdownSeconds(deadline, now)).toBe(seconds);
      expect(remainingCountdownSeconds(deadline, now + 17_250)).toBe(seconds - 17);
      expect(remainingCountdownSeconds(deadline, now + seconds * 1000)).toBe(0);
      expect(remainingCountdownSeconds(deadline, now + (seconds + 3600) * 1000)).toBe(0);
    }
  });
  it('does not carry an old stage timer into a completed round or invent a missing start', () => {
    expect(paneerCountdownDeadline({ status: 'frozen', pressingStartedAt: start })).toBeNull();
    expect(paneerCountdownDeadline({ status: 'pressing' })).toBeNull();
    expect(paneerCountdownDeadline({ status: 'pressing', pressingStartedAt: 'invalid' })).toBeNull();
    expect(remainingCountdownSeconds(null, now)).toBe(0);
    expect(formatCountdownTime(1800)).toBe('30:00');
    expect(formatCountdownTime(61)).toBe('1:01');
  });
});
