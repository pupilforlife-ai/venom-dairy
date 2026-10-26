import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FactoryChecklistDownload } from './FactoryChecklistDownload';
import type { FactoryCheckRecord } from '../lib/factoryChecklist';

const saved: FactoryCheckRecord = { id: 'one-specific-check', check_date: '2026-10-26', status: 'completed', recorded_at: '2026-10-26T15:51:44Z',
  recorded_by: 'owner', recorded_by_name: 'sa', payload: { scope: 'temperatures', locks: {}, corridorReasons: [], temperatures: {} } };

afterEach(() => vi.unstubAllGlobals());
describe('saved checklist PDF control', () => {
  it('shows a clearly named download control for the owner without submitting the form', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'owner' });
    const html = renderToStaticMarkup(<FactoryChecklistDownload record={saved} />);
    expect(html).toContain('Download this checklist (PDF)');
    expect(html).toContain('type="button"');
    expect(html).toContain('Morning and evening checks download separately.');
  });
  it.each(['admin', 'staff', null])('does not offer downloads for role %s', role => {
    vi.stubGlobal('localStorage', { getItem: () => role });
    expect(renderToStaticMarkup(<FactoryChecklistDownload record={saved} />)).toBe('');
  });
});
