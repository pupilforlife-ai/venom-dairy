export interface PaneerWeightComparison {
  blockWeightKg: number;
  pan111Kg: number;
  packableWeightKg: number;
  packedWeightKg: number;
  differenceKg: number;
}

/**
 * Compare the paneer blocks recorded after cutting with the non-PAN111 weight
 * recorded during packing. A positive difference means weight is still
 * unaccounted for; a negative difference means the packed record exceeds the
 * calculated weight available after PAN111.
 */
export function comparePaneerBlockToPackedWeight(
  blockWeightKg: number,
  pan111Kg: number,
  packedWeightKg: number,
): PaneerWeightComparison {
  const block = Math.max(0, Number(blockWeightKg) || 0);
  const pan111 = Math.max(0, Number(pan111Kg) || 0);
  const packed = Math.max(0, Number(packedWeightKg) || 0);
  const packable = block - pan111;
  const difference = packable - packed;
  const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

  return {
    blockWeightKg: round(block),
    pan111Kg: round(pan111),
    packableWeightKg: round(packable),
    packedWeightKg: round(packed),
    differenceKg: round(difference),
  };
}

