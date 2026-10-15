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

describe('variable restaurant-block case weights', () => {
  it.each(['MPAN010', 'RPAN010'])('%s keeps its 20 kg default and calculates variable cases', sku => {
    const definition = paneerSkuByCode[sku];
    expect(getPaneerPackWeight(definition, 2, 0, 0, 0)).toBe(40);
    expect(getPaneerPackWeight(definition, 2, 0, 0, 0, 30)).toBe(60);
    expect(getPaneerPackWeight(definition, 1, 0, 0, 0, 10)).toBe(10);
    expect(
      getPaneerPackWeight(definition, 2, 0, 0, 0)
      + getPaneerPackWeight(definition, 2, 0, 0, 0, 30)
      + getPaneerPackWeight(definition, 1, 0, 0, 0, 10),
    ).toBe(110);
  });
});
