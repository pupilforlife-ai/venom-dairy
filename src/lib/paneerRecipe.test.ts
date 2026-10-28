import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import type { ProductionRound } from '../data/mockData';
import { PaneerRecipePanel } from '../components/PaneerRecipePanel';
import { buildProductionRoundHistory } from './productionRoundHistory';
import { getPaneerRecipe, getPaneerRecipeMilkLitres, latestPaneerIngredientIssue, paneerIssueMatchesRound, recordPaneerIngredientAllocation } from './paneerRecipe';

const now = '2026-10-28T10:00:00Z';
const later = '2026-10-28T11:00:00Z';
function round(overrides: Partial<ProductionRound> = {}): ProductionRound {
  return { id: 'recipe-test-round', milkLotId: 'test-lot', milkLotCode: 'TEST', shiftId: 'test-shift',
    shiftNumber: 1, roundNumber: 1, type: 'D', status: 'scheduled', team: ['test'], plannedInput: 500,
    actualInput: 0, outputWeight: 0, startTime: now, locked: false, ...overrides };
}
const issued = (type: 'D' | 'C/S' = 'D') => recordPaneerIngredientAllocation(round({ type, status: 'in_production', vat: 'vat2', actualInput: 500 }), now, 'test-user', 'Production started', true);
const quantities = (type: 'D' | 'C/S', milkLitres: number) => Object.fromEntries(getPaneerRecipe(type, milkLitres).lines.map(line => [line.id, line.quantity]));

describe('owner-confirmed paneer recipes', () => {
  it('uses the three shared ingredients at exactly the same quantities for 500 L D and C/S', () => {
    expect(quantities('D', 500)).toEqual({ calcium_chloride: 400, gdl: 1850, potassium_sorbate: 250 });
    expect(quantities('C/S', 500)).toEqual({ calcium_chloride: 400, gdl: 1850, potassium_sorbate: 250, fis: 835, af_oil: 20 });
    expect(getPaneerRecipe('C/S', 500).lines.find(line => line.id === 'af_oil')?.unit).toBe('kg');
    expect(getPaneerRecipe('C/S', 500).lines.find(line => line.id === 'fis')?.unit).toBe('g');
  });
  it('scales all ingredients by milk volume, without confusing grams and kilograms', () => {
    expect(quantities('C/S', 250)).toEqual({ calcium_chloride: 200, gdl: 925, potassium_sorbate: 125, fis: 417.5, af_oil: 10 });
    expect(quantities('C/S', 1000).af_oil).toBe(40);
    expect(quantities('D', 1000).gdl).toBe(3700);
  });
  it.each([0, -500, NaN, Infinity])('rejects invalid milk input %s instead of inventing quantities', milk => {
    expect(() => getPaneerRecipe('D', milk)).toThrow('positive milk');
  });
  it('returns independent snapshots; editing one does not rewrite a recipe or another round', () => {
    const first = getPaneerRecipe('D', 500);
    first.lines[0].quantity = 999;
    expect(quantities('D', 500).calcium_chloride).toBe(400);
  });
  it('uses milk input, not output weight or cream recovery, as the recipe basis', () => {
    expect(getPaneerRecipeMilkLitres(round({ actualInput: 500, outputWeight: 70, creamRecovered: 34 }))).toBe(500);
    expect(getPaneerRecipeMilkLitres(round({ plannedInput: 450 }))).toBe(450);
  });
});

describe('paneer ingredient issues and corrections', () => {
  it('does not issue when merely scheduled, before a vat is chosen, or when viewing a legacy round', () => {
    for (const input of [round(), round({ status: 'in_production' }), round({ status: 'frozen', vat: 'vat2' })]) {
      expect(recordPaneerIngredientAllocation(input, now, 'test', 'Preview', true)).toBe(input);
    }
    const legacy = round({ status: 'in_production', vat: 'vat2' });
    expect(recordPaneerIngredientAllocation(legacy, now, 'test', 'View existing')).toBe(legacy);
  });
  it('creates one issue with time, actor, vat, exact formula version and quantities at production start', () => {
    const result = issued('C/S');
    const issue = latestPaneerIngredientIssue(result)!;
    expect(result.paneerIngredientIssues).toHaveLength(1);
    expect(issue).toMatchObject({ id: 'paneer-issue-recipe-test-round-1', kind: 'issue', recordedAt: now, recordedBy: 'test-user', vat: 'vat2', milkLitres: 500, paneerType: 'C/S', version: 'paneer-2026-10-28-v1' });
    expect(issue.changes).toEqual(issue.lines);
    expect(paneerIssueMatchesRound(result)).toBe(true);
    const history = buildProductionRoundHistory(result).find(event => event.stage === 'Paneer Ingredients Issued');
    expect(history).toMatchObject({ occurredAt: now, recordedBy: 'test-user' });
    expect(history?.details).toContain('AF oil: 20 kg');
  });
  it('does not double-issue on repeated start or subsequent stages', () => {
    const original = issued();
    expect(recordPaneerIngredientAllocation(original, later, 'other', 'Repeat start', true)).toBe(original);
    const pressing = { ...original, status: 'pressing' };
    expect(recordPaneerIngredientAllocation(pressing, later, 'other', 'Pressing')).toBe(pressing);
  });
  it('keeps the issued type while a correction is only pending', () => {
    const pending = { ...issued(), typeChangeRequest: { status: 'pending' as const, from: 'D' as const, to: 'C/S' as const, reason: 'Correction', requestedAt: later, requestedBy: 'test' } };
    expect(recordPaneerIngredientAllocation(pending, later, 'test', 'Pending')).toBe(pending);
  });
  it('adds only FIS and AF oil for approved D to C/S, retaining the original issue', () => {
    const original = issued();
    const corrected = recordPaneerIngredientAllocation({ ...original, type: 'C/S' }, later, 'owner', 'Approved type correction');
    expect(corrected.paneerIngredientIssues).toHaveLength(2);
    expect(corrected.paneerIngredientIssues?.[0]).toBe(original.paneerIngredientIssues?.[0]);
    expect(latestPaneerIngredientIssue(corrected)?.changes).toEqual([
      { id: 'fis', name: 'FIS', quantity: 835, unit: 'g' }, { id: 'af_oil', name: 'AF oil', quantity: 20, unit: 'kg' },
    ]);
    expect(latestPaneerIngredientIssue(corrected)?.kind).toBe('adjustment');
    expect(recordPaneerIngredientAllocation(corrected, later, 'owner', 'Retry')).toBe(corrected);
  });
  it('records signed reversals, not another full issue, for C/S to D', () => {
    const corrected = recordPaneerIngredientAllocation({ ...issued('C/S'), type: 'D' }, later, 'owner', 'Approved correction');
    expect(latestPaneerIngredientIssue(corrected)?.changes.map(line => [line.id, line.quantity])).toEqual([['fis', -835], ['af_oil', -20]]);
    expect(latestPaneerIngredientIssue(corrected)?.lines).toHaveLength(3);
  });
  it('records only the net change when milk input is corrected, without modifying production measurements', () => {
    const original = { ...issued('C/S'), blockWeights: [10, 12], packedSkus: [{ sku: 'RPAN100', cases: 1, loose: 0 }] };
    const changed = recordPaneerIngredientAllocation({ ...original, plannedInput: 250, actualInput: 250 }, later, 'owner', 'Correct milk quantity');
    expect(latestPaneerIngredientIssue(changed)?.changes.find(line => line.id === 'af_oil')?.quantity).toBe(-10);
    expect(changed.blockWeights).toBe(original.blockWeights);
    expect(changed.packedSkus).toBe(original.packedSkus);
  });
  it('leaves non-paneer production alone', () => {
    const input = round({ type: 'Halloumi', status: 'in_production', vat: 'vat2' });
    expect(recordPaneerIngredientAllocation(input, now, 'test', 'Start', true)).toBe(input);
  });
});

describe('paneer recipe visibility', () => {
  it('shows the standard recipe before starting and clearly explains when it is issued', () => {
    const html = renderToStaticMarkup(createElement(PaneerRecipePanel, { round: round({ type: 'C/S' }), preview: true }));
    for (const text of ['Calcium chloride', 'GDL', 'Potassium sorbate', '835', 'AF oil', '20 kg', 'Cancel does not issue']) expect(html).toContain(text);
  });
  it('labels existing rounds honestly instead of manufacturing historical issue timestamps', () => {
    const html = renderToStaticMarkup(createElement(PaneerRecipePanel, { round: round({ status: 'frozen' }) }));
    expect(html).toContain('No ingredient issue was captured');
    expect(html).not.toContain('Issued:');
  });
  it('shows a mismatch warning if a legacy client changed a round after an issue', () => {
    const html = renderToStaticMarkup(createElement(PaneerRecipePanel, { round: { ...issued(), type: 'C/S' } }));
    expect(html).toContain('Owner/admin review is required');
    expect(html).not.toContain('<dt>AF oil</dt>');
  });
});
