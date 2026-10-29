import { Package } from 'lucide-react';
import { ButterPackingSku, getAllowedButterPackingSkus } from '../lib/butterPacking';

export function ButterPackingActions({ kind, poolSku, onPack }: {
  kind: 'direct' | 'blended'; poolSku: ButterPackingSku; onPack: (sku: ButterPackingSku) => void;
}) {
  return <div className="flex flex-wrap gap-2">
    {getAllowedButterPackingSkus(kind, poolSku).map(sku => <button key={sku} type="button" onClick={() => onPack(sku)}
      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700">
      <Package className="h-3 w-3" />{poolSku === 'PSBBB' && sku === 'BB05' ? 'Make Bricks → BB05'
        : poolSku === 'BB05' && sku === 'PSBBB' ? 'Pack leftover as PSBBB' : `Pack as ${sku}`}
    </button>)}
  </div>;
}
