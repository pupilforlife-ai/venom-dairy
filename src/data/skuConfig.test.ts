import { describe, expect, it } from 'vitest';
import {
  getPaneerPackWeight,
  normalizeFinishedGoodsSku,
  paneerSkuByCode,
} from './skuConfig';

describe('1 kg paneer SKU weights', () => {
  it.each([
    ['MPAN100', 'MPAN100'],
    ['RPAN100', 'RPAN100'],
    ['MPAN101', 'MPAN101'],
    ['RPAN101', 'RPAN101'],
    ['PAN101', 'MPAN101'],
  ])('treats %s as a 1 kg packet', (enteredSku, canonicalSku) => {
    const normalized = normalizeFinishedGoodsSku(enteredSku);
    expect(normalized).toBe(canonicalSku);
    const definition = paneerSkuByCode[normalized];
    expect(definition.unitWeightKg).toBe(1);
    expect(getPaneerPackWeight(definition, 1, 1, 0, 0)).toBe(16);
  });
});
