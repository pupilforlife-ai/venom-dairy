export const BUTTER_PER_BLEND_ROUND_KG = 16.5;
export const REPLACER_PER_BLEND_ROUND_KG = 5;
export const SALT_PER_BLEND_ROUND_KG = 0.145;

export type ButterBlendRecipe = {
  fullRounds: number;
  partialButterKg: number;
  butterKg: number;
  replacerKg: number;
  saltKg: number;
  outputKg: number;
};

function roundTo(value: number, places: number) {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Scale the fixed blend recipe proportionally for full and partial batches. */
export function calculateButterBlendRecipe(butterKg: number, isSalted: boolean): ButterBlendRecipe {
  const safeButterKg = Number.isFinite(butterKg) ? Math.max(0, butterKg) : 0;
  const fullRounds = Math.floor(safeButterKg / BUTTER_PER_BLEND_ROUND_KG);
  const partialButterKg = roundTo(safeButterKg - fullRounds * BUTTER_PER_BLEND_ROUND_KG, 2);
  const replacerKg = roundTo(safeButterKg * REPLACER_PER_BLEND_ROUND_KG / BUTTER_PER_BLEND_ROUND_KG, 2);
  const saltKg = isSalted
    ? roundTo(safeButterKg * SALT_PER_BLEND_ROUND_KG / BUTTER_PER_BLEND_ROUND_KG, 3)
    : 0;
  return {
    fullRounds,
    partialButterKg,
    butterKg: roundTo(safeButterKg, 2),
    replacerKg,
    saltKg,
    outputKg: roundTo(safeButterKg + replacerKg + saltKg, 3),
  };
}
