import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ButterPackingActions } from '../components/ButterPackingActions';
import { getAllowedButterPackingSkus } from './butterPacking';

describe('salted butter brick / leftover ball packing', () => {
  it('allows both formats from an existing BB05 pool without changing it', () => {
    const existing = Object.freeze({ pool: 'BB05' as const, status: 'bb05_pool', remainingBalance: 12,
      packedSkus: Object.freeze([{ sku: 'BB05', cases: 2, loose: 0 }]) });
    const before = JSON.stringify(existing);
    expect(getAllowedButterPackingSkus('blended', existing.pool)).toEqual(['BB05', 'PSBBB']);
    expect(JSON.stringify(existing)).toBe(before);
  });
  it('keeps PSBBB eligible for bricks without converting the underlying pool', () => {
    expect(getAllowedButterPackingSkus('blended', 'PSBBB')).toEqual(['PSBBB', 'BB05']);
  });
  it.each([['direct', 'PUBB'], ['blended', 'PUBBB']] as const)('does not change %s %s packing permissions', (kind, sku) => {
    expect(getAllowedButterPackingSkus(kind, sku)).toEqual([sku]);
  });
  it.each(['BB05', 'PSBBB'] as const)('renders both packing choices for %s without running an action', poolSku => {
    const html = renderToStaticMarkup(<ButterPackingActions kind="blended" poolSku={poolSku}
      onPack={() => { throw new Error('Opening/rendering choices must not change records'); }} />);
    expect(html).toContain('BB05');
    expect(html).toContain('PSBBB');
    expect(html.match(/type="button"/g)).toHaveLength(2);
    if (poolSku === 'BB05') expect(html).toContain('Pack leftover as PSBBB');
  });
});
