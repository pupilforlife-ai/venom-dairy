export type ButterPackingSku = 'PUBB' | 'PUBBB' | 'PSBBB' | 'BB05';

/** Bricks and salted balls are two packing formats of the same salted blend.
 * BB05 pools made by the older "Make Bricks" action remain usable as-is; no
 * historical pool conversion or quantity rewrite is needed. */
export function getAllowedButterPackingSkus(kind: 'direct' | 'blended', poolSku: ButterPackingSku): ButterPackingSku[] {
  if (kind === 'direct') return ['PUBB'];
  if (poolSku === 'PSBBB' || poolSku === 'BB05') return [poolSku, poolSku === 'PSBBB' ? 'BB05' : 'PSBBB'];
  return [poolSku];
}
