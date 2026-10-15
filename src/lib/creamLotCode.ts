const supplierPrefixes: Array<{ matches: string[]; prefix: string }> = [
  { matches: ['lc dairies', 'lc dairy'], prefix: 'LC' },
  { matches: ['greek gourmet'], prefix: 'GG' },
];

function supplierPrefix(supplier: string) {
  const normalized = supplier.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const known = supplierPrefixes.find(entry => entry.matches.includes(normalized));
  if (known) return known.prefix;

  const words = normalized.split(/\s+/).filter(Boolean);
  const acronym = words.map(word => word[0]).join('').slice(0, 2).toUpperCase();
  return acronym || 'CR';
}

/** Build a standalone supplier/date cream lot code, adding a suffix on collision. */
export function createExternalCreamLotCode(
  supplier: string,
  dateReceived: string,
  existingLotCodes: string[] = [],
) {
  const [year, month, day] = dateReceived.split('-');
  if (!year || !month || !day) throw new Error('Receipt date must be YYYY-MM-DD');

  const base = `${supplierPrefix(supplier)}-${day}${month}${year.slice(-2)}`;
  const existing = new Set(existingLotCodes.map(code => code.toUpperCase()));
  if (!existing.has(base)) return base;

  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}
