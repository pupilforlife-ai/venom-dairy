import { memo, useEffect, useState, type ReactNode } from 'react';

const phoneQuery = '(max-width: 767px)';
export function usePhonePaneerBoard() {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(phoneQuery).matches);
  useEffect(() => {
    const media = window.matchMedia(phoneQuery);
    const changed = () => setPhone(media.matches);
    changed();
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  return phone;
}

/** Mount only the needed layout initially. Retain visited layouts so resizing
 * cannot discard an open after-cutting/tray form or its unsaved draft. */
export const PaneerBoardView = memo(function PaneerBoardView({ active, children }: { active: boolean; children: ReactNode }) {
  const [visited, setVisited] = useState(active);
  if (active && !visited) setVisited(true);
  return active || visited ? children : null;
}, (previous, next) => !previous.active && !next.active);
