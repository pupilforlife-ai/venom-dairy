import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CrumbingBatch } from '../pages/CrumbingTab';
import { CrumbingIngredientBalances } from './CrumbingIngredientBalances';
import { appendCoatingBalance, buildCoatingBalanceRecord } from '../lib/crumbingIngredientBalances';

const batch: CrumbingBatch = { id: 'test', batchCode: 'TEST-SPP', type: 'SPP', sourceBatchId: 'source', sourceBatchCode: 'TEST-SOURCE',
  status: 'crumbing', traysCrumbed: 4, traysRemaining: 4, traysFried: 0, traysPacked: 0, createdAt: '2026-11-03T08:00:00Z',
  recipe: { flavourMultiplier: 1, batterMultiplier: 1, breadingMultiplier: 1, flavourIyababKg: 0.8,
    flavourPredustKg: 0.2, batterIyababaKg: 1, batterWaterL: 2.5, breadingAdajioKg: 1 } };
describe('ingredient balances entry point', () => {
  it('renders a compact button, not expanded forms on the production board', () => {
    const html = renderToStaticMarkup(<CrumbingIngredientBalances batch={batch} onSave={() => { throw Error('No writes during render'); }} onOpenProcess={() => {}} />);
    expect(html).toContain('Ingredient balances · Not recorded');
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('<input');
  });
  it('shows the recorded status without rewriting the recipe', () => {
    const record = buildCoatingBalanceRecord(batch, { flavourBasis: 'separate', iyababaKg: 0, predustKg: 0, flavourMixKg: 0,
      batterBasis: 'dry', batterKg: 0, adajioKg: 0 }, { id: 'check', note: '', recordedAt: '2026-11-03T09:00:00Z', recordedBy: 'Tester' });
    const saved = appendCoatingBalance(batch, record);
    const html = renderToStaticMarkup(<CrumbingIngredientBalances batch={saved} onSave={() => false} onOpenProcess={() => {}} />);
    expect(html).toContain('Ingredient balances · Recorded');
    expect(saved.recipe).toBe(batch.recipe);
  });
});
