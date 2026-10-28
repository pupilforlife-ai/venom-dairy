import type { ProductionRound } from '../data/mockData';
import { getPaneerRecipe, getPaneerRecipeMilkLitres, latestPaneerIngredientIssue, paneerIssueMatchesRound } from '../lib/paneerRecipe';
import { formatRoundHistoryTime } from '../lib/productionRoundHistory';

export function PaneerRecipePanel({ round, preview = false }: { round: ProductionRound; preview?: boolean }) {
  if (round.type !== 'D' && round.type !== 'C/S') return null;
  const milkLitres = getPaneerRecipeMilkLitres(round);
  if (!Number.isFinite(milkLitres) || milkLitres <= 0) return <p className="text-sm text-amber-800">A positive milk quantity is needed to calculate the recipe.</p>;
  const latest = latestPaneerIngredientIssue(round);
  const recipe = preview ? getPaneerRecipe(round.type, milkLitres) : latest || getPaneerRecipe(round.type, milkLitres);
  return <section className="rounded-lg border border-blue-200 bg-blue-50/40 p-3">
    <h4 className="text-sm font-bold text-blue-950">Paneer recipe &amp; ingredient issue</h4>
    <p className="mt-1 text-xs text-blue-900">{recipe.paneerType} · {recipe.milkLitres} L milk · {recipe.milkLitres / recipe.basisMilkLitres} × the 500 L recipe</p>
    <dl className="mt-2 space-y-1 text-sm">{recipe.lines.map(line => <div key={line.id} className="flex justify-between gap-3"><dt>{line.name}</dt><dd className="whitespace-nowrap font-semibold">{line.quantity.toLocaleString('en-GB', { maximumFractionDigits: 6 })} {line.unit}</dd></div>)}</dl>
    {preview ? <p className="mt-2 text-xs text-blue-900">These ingredients are recorded as issued when you confirm Start Production. Cancel does not issue ingredients.</p> : latest ? <>
      <p className="mt-2 text-xs text-slate-600">{latest.kind === 'issue' ? 'Issued' : 'Allocation adjusted'}: {formatRoundHistoryTime(latest.recordedAt)} · by {latest.recordedBy} · {latest.vat === 'vat2' ? 'Vat 2' : 'Vat 3'}</p>
      {!paneerIssueMatchesRound(round) && <p className="mt-2 text-xs font-semibold text-amber-800">The recorded issue differs from the current round type or milk quantity. Owner/admin review is required; the original issue has been preserved.</p>}
      {(round.paneerIngredientIssues?.length || 0) > 1 && <details className="mt-2 text-xs"><summary className="cursor-pointer font-semibold">Original issue and allocation adjustments</summary>{round.paneerIngredientIssues?.map(issue => <div key={issue.id} className="mt-2 border-t border-blue-100 pt-2"><p>{issue.kind === 'issue' ? 'Initial issue' : 'Adjustment (not another full issue)'} · {formatRoundHistoryTime(issue.recordedAt)} · {issue.recordedBy}</p><p>{issue.changes.map(line => `${line.name} ${line.quantity > 0 ? '+' : ''}${line.quantity} ${line.unit}`).join(' · ')}</p><p>{issue.reason}</p></div>)}</details>}
    </> : <p className="mt-2 text-xs text-amber-900">{round.status === 'scheduled' ? 'Not issued yet — issue will be recorded at production start.' : 'Recipe reference only. No ingredient issue was captured for this existing round; no historical issue time has been invented.'}</p>}
    <p className="mt-2 text-[11px] text-slate-500">Calculated standard usage for production accounting and QC comparison. No inventory is connected or deducted; actual addition is not verified by this record. Recipe: {recipe.version}.</p>
  </section>;
}
