import { useEffect, useState, type ReactNode } from 'react';
import type { ProductionRound } from '../data/mockData';
import { paneerCountdownDeadline, remainingCountdownSeconds } from '../lib/paneerCountdown';

/** Only this small display updates each second; the board and its forms stay still. */
export function PaneerCountdown({ round, children }: { round: ProductionRound; children: (seconds: number) => ReactNode }) {
  const deadline = paneerCountdownDeadline(round);
  const [tick, setTick] = useState(Date.now);
  useEffect(() => {
    if (deadline === null) return;
    const update = () => {
      setTick(Date.now());
      if (Date.now() >= deadline) clearInterval(interval);
    };
    const interval = setInterval(update, 1000);
    update();
    return () => clearInterval(interval);
  }, [deadline]);
  return children(remainingCountdownSeconds(deadline, tick));
}
