import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Modal } from './Modal';
import type { CrumbingBatch } from '../pages/CrumbingTab';
import { buildCoatingBalanceRecord, getCoatingBalanceReport, getCreamCheeseUsage, getPreparedBatterRecipe,
  type CoatingBalanceRecord, type CoatingBalanceMeasurement } from '../lib/crumbingIngredientBalances';

interface Props {
  batch: CrumbingBatch;
  onSave: (record: CoatingBalanceRecord) => boolean;
  onOpenProcess: () => void;
}
const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const kg = (value: number | null) => value === null ? 'Not recorded' : `${value.toFixed(3)} kg`;

export function CrumbingIngredientBalances({ batch, onSave, onOpenProcess }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [flavourBasis, setFlavourBasis] = useState<'' | 'separate' | 'mixed'>('');
  const [batterBasis, setBatterBasis] = useState<'' | 'dry' | 'prepared'>('');
  const [values, setValues] = useState<Record<string, string>>({});
  const report = getCoatingBalanceReport(batch);
  const cheese = getCreamCheeseUsage(batch);
  const issued = report.issued;
  const batterRecipe = getPreparedBatterRecipe(batch);
  const hasIssues = Object.values(issued).some(value => value > 0);
  const label = report.status === 'recorded' ? 'Recorded' : report.status === 'missing' ? 'Not recorded' : 'Recheck needed';
  const records = Object.values(batch.ingredientBalanceHistory || {}).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt) || b.id.localeCompare(a.id));
  const valueField = (key: string, title: string) => <label className="block text-sm font-medium text-slate-700">{title}
    <input type="number" inputMode="decimal" min="0" step="0.001" value={values[key] ?? ''}
      onChange={event => setValues(current => ({ ...current, [key]: event.target.value }))} className={inputClass} />
  </label>;
  const show = () => {
    setError(''); setNote('');
    const m = report.status === 'recorded' ? report.record?.measurement : undefined;
    setFlavourBasis(m?.flavourBasis || (batch.type !== 'SPP' ? 'separate' : ''));
    setBatterBasis(m?.batterBasis || '');
    setValues(m ? Object.fromEntries(Object.entries(m).filter(([, value]) => typeof value === 'number').map(([key, value]) => [key, String(value)])) : {});
    setOpen(true);
  };
  const save = () => {
    try {
      if (batch.type === 'SPP' && issued.iyababa + issued.predust > 0 && !flavourBasis) throw new Error('Choose how the flavour balance was weighed.');
      if (issued.batterMix > 0 && !batterBasis) throw new Error('Choose dry powder or prepared batter.');
      const read = (key: string, needed: boolean) => {
        if (!needed) return 0;
        if (!values[key]?.trim()) throw new Error('Enter every applicable balance, including 0 when none remains.');
        return Number(values[key]);
      };
      const measurement: CoatingBalanceMeasurement = {
        flavourBasis: flavourBasis || 'separate', batterBasis: batterBasis || 'dry',
        iyababaKg: read('iyababaKg', batch.type === 'SPP' && flavourBasis !== 'mixed' && issued.iyababa > 0),
        predustKg: read('predustKg', flavourBasis !== 'mixed' && issued.predust > 0),
        flavourMixKg: read('flavourMixKg', flavourBasis === 'mixed'),
        batterKg: read('batterKg', issued.batterMix > 0),
        batterCalculationBasis: batterBasis === 'prepared' ? 'recipe_ratio' : undefined,
        adajioKg: read('adajioKg', issued.adajio > 0),
      };
      const record = buildCoatingBalanceRecord(batch, measurement, { id: uuidv4(), recordedAt: new Date().toISOString(),
        recordedBy: window.localStorage.getItem('vejoy_user_username') || '', note });
      if (onSave(record)) setOpen(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not record balances'); }
  };
  return <>
    <button type="button" onClick={show} className="mt-2 rounded border border-teal-200 bg-teal-50 px-2 py-1 text-[11px] font-semibold text-teal-800 hover:bg-teal-100">
      Ingredient balances · {label}
    </button>
    <Modal isOpen={open} onClose={() => setOpen(false)} title={`Ingredient balances · ${batch.batchCode}`} size="lg">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Consumed = issued − unused balance. Original recipe additions, source paneer/Halloumi, trays and packing stay unchanged.</p>
        {report.status === 'changed' && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Ingredient issues changed after the last balance check (or these batches were clubbed). Reweigh and record a new balance. Previous checks remain in history.</p>}
        {report.status === 'conflict' && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Two balance checks were recorded concurrently. Review their history and enter one new physical check to resolve them. No consumption is assumed.</p>}
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full table-fixed break-words text-left text-xs sm:text-sm"><thead className="bg-slate-50"><tr>{['Ingredient', 'Issued', 'Unused balance', 'Consumed'].map(text => <th key={text} className="px-1.5 py-2 sm:px-3">{text}</th>)}</tr></thead>
            <tbody>{report.rows.map(row => <tr key={row.key} className="border-t border-slate-100"><th className="px-1.5 py-2 font-medium sm:px-3">{row.label}</th><td className="px-1.5 py-2 sm:px-3">{kg(row.issuedKg)}</td><td className="px-1.5 py-2 sm:px-3">{kg(row.remainingKg)}</td><td className="px-1.5 py-2 font-semibold sm:px-3">{kg(row.consumedKg)}</td></tr>)}</tbody>
          </table>
        </div>
        {batch.type === 'JP' && <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-950">
          <h4 className="font-semibold">Cream cheese — filling record</h4>
          <p className="mt-1">Available (fresh + carryover): {kg(cheese.availableKg)} · Leftover: {kg(cheese.remainingKg)} · Used: {kg(cheese.consumedKg)}</p>
          <p className="mt-1 text-xs">{cheese.disposition === 'carry_forward' ? 'Leftover carried forward to another JP batch.' : cheese.disposition === 'discarded' ? 'Leftover discarded, not counted as filling used.' : 'Record the weighed cream-cheese balance during cheese filling.'} The filling record remains the single source for cream-cheese use and carryover.</p>
          <button type="button" onClick={() => { setOpen(false); onOpenProcess(); }} className="mt-2 font-semibold underline">{batch.status === 'jp_filling' ? 'Record cream-cheese balance in filling' : 'View JP filling / cream-cheese record'}</button>
        </div>}
        {!batch.clubbedInto && hasIssues && <fieldset className="space-y-3 rounded-lg border border-teal-200 bg-teal-50/40 p-3">
          <legend className="px-1 text-sm font-semibold text-teal-900">Record unused coating weights (kg)</legend>
          <p className="text-xs text-slate-600">Weigh unused material only. Do not include coating already on the product. Enter 0 explicitly if none remains.</p>
          {batch.type === 'SPP' && issued.iyababa + issued.predust > 0 && <label className="block text-sm font-medium text-slate-700">Flavour balance measurement<select value={flavourBasis} onChange={event => setFlavourBasis(event.target.value as typeof flavourBasis)} className={inputClass}><option value="">Choose measurement basis</option><option value="separate">Separate dry Iyababa and Predust</option><option value="mixed">Combined dry flavour mixture</option></select></label>}
          {flavourBasis === 'mixed' ? <>{valueField('flavourMixKg', 'Unused dry flavour mixture (kg)')}<p className="text-xs text-slate-500">Allocated between Iyababa and Predust in the recorded recipe proportions. Use only for a homogeneous dry mixture.</p></> : <div className="grid gap-3 sm:grid-cols-2">{batch.type === 'SPP' && issued.iyababa > 0 && valueField('iyababaKg', 'Unused dry Iyababa (kg)')}{issued.predust > 0 && valueField('predustKg', 'Unused dry Predust (kg)')}</div>}
          {issued.batterMix > 0 && <>
            <label className="block text-sm font-medium text-slate-700">Batter balance measurement<select value={batterBasis} onChange={event => setBatterBasis(event.target.value as typeof batterBasis)} className={inputClass}><option value="">Choose measurement basis</option><option value="dry">Unused dry powder — not mixed with water</option><option value="prepared">Prepared batter — powder and water mixed</option></select></label>
            {batterBasis && valueField('batterKg', batterBasis === 'prepared' ? 'Unused prepared batter (kg)' : 'Unused dry batter powder (kg)')}
            {batterBasis === 'prepared' && <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-950"><p>Calculated from the recorded recipe: {kg(batterRecipe.powderKg)} powder + {batterRecipe.waterL.toFixed(3)} L water ≈ {kg(batterRecipe.totalKg)} prepared batter. No original mixture weight needs to be entered.</p><p className="mt-1">Assumes an evenly mixed batter and 1 L water ≈ 1 kg. Only the dry-powder equivalent is deducted from the powder issued.</p>{values.batterKg?.trim() && Number.isFinite(Number(values.batterKg)) && Number(values.batterKg) >= 0 && batterRecipe.totalKg > 0 && <p className="mt-2 font-semibold">{kg(Number(values.batterKg))} prepared balance contains approximately {kg(Number(values.batterKg) * batterRecipe.powderKg / batterRecipe.totalKg)} dry powder.</p>}</div>}
          </>}
          {issued.adajio > 0 && valueField('adajioKg', 'Unused Adajio (kg)')}
          <label className="block text-sm font-medium text-slate-700">{records.length ? 'Reason for recheck / correction (required)' : 'Note (optional)'}<textarea value={note} onChange={event => setNote(event.target.value)} rows={2} className={inputClass} /></label>
          {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
          <button type="button" onClick={save} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">Save ingredient balances</button>
        </fieldset>}
        {batch.clubbedInto && <p className="text-sm text-slate-600">This source batch was clubbed. Record the current balance on the combined batch; this source history is preserved.</p>}
        {!hasIssues && <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><p>Coating ingredients have not been issued to this batch yet. Record their +1 additions during crumbing, then enter the unused balances.</p>{batch.type === 'JP' && <button type="button" onClick={() => { setOpen(false); onOpenProcess(); }} className="mt-2 font-semibold underline">Open JP process to continue</button>}</div>}
        {records.length > 0 && <details className="rounded-lg border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-semibold">Balance audit history ({records.length})</summary><div className="mt-3 space-y-3">{records.map(record => <div key={record.id} className="rounded bg-slate-50 p-3 text-xs text-slate-700"><p className="font-semibold">{new Date(record.recordedAt).toLocaleString('en-ZA')} · {record.recordedBy}</p>{report.rows.map(row => <p key={row.key}>{row.label}: {kg(record.issued[row.key])} issued − {kg(record.remaining[row.key])} balance = {kg(record.issued[row.key] - record.remaining[row.key])} consumed</p>)}{record.note && <p className="mt-1">{record.note}</p>}</div>)}</div></details>}
      </div>
    </Modal>
  </>;
}
