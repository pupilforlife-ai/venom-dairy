/** Yield as a percentage of recorded input; null means there is no valid input. */
export function calculateYieldPercent(outputKg: number, inputKg: number): number | null {
  if (!Number.isFinite(outputKg) || !Number.isFinite(inputKg) || inputKg <= 0) return null;
  return (outputKg / inputKg) * 100;
}
