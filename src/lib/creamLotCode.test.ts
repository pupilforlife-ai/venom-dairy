import { describe, expect, it } from 'vitest';
import { createExternalCreamLotCode } from './creamLotCode';

describe('createExternalCreamLotCode', () => {
  it('uses the agreed supplier initials and DDMMYY receipt date', () => {
    expect(createExternalCreamLotCode('LC Dairies', '2026-10-14')).toBe('LC-141026');
    expect(createExternalCreamLotCode('Greek Gourmet', '2026-10-14')).toBe('GG-141026');
  });

  it('adds a suffix rather than reusing a same-supplier same-day lot number', () => {
    expect(createExternalCreamLotCode('LC Dairies', '2026-10-14', ['LC-141026'])).toBe('LC-141026-2');
    expect(createExternalCreamLotCode('LC Dairies', '2026-10-14', ['LC-141026', 'LC-141026-2'])).toBe('LC-141026-3');
  });
});
