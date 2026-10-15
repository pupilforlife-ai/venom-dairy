/** Parse a plain quantity or a simple sum such as `12 + 13` safely. */
export function parseAdditiveQuantity(input: string): number | null {
  const normalized = input.trim();
  if (!normalized) return null;

  const terms = normalized.split('+').map(term => term.trim());
  if (terms.some(term => !/^\d+(?:\.\d+)?$/.test(term))) return null;

  const total = terms.reduce((sum, term) => sum + Number(term), 0);
  return Number.isFinite(total) ? Math.round((total + Number.EPSILON) * 100) / 100 : null;
}
