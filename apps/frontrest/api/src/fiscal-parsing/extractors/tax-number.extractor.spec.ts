import { TaxNumberExtractor } from './tax-number.extractor';
import { FiscalField } from '../types';

describe('TaxNumberExtractor', () => {
  const extractor = new TaxNumberExtractor();

  it('declara o campo SUPPLIER_TAX_ID', () => {
    expect(extractor.field).toBe(FiscalField.SUPPLIER_TAX_ID);
  });

  it('extrai um NIF português (9 dígitos) com rótulo "NIF"', () => {
    const result = extractor.extract('NIF: 123456789');
    expect(result).toEqual({ value: '123456789', confidence: 90, source: expect.stringContaining('123456789') });
  });

  it('extrai um VAT intracomunitário com prefixo de país', () => {
    const result = extractor.extract('VAT Number: PT123456789');
    expect(result?.value).toBe('PT123456789');
  });

  it('extrai com rótulo "NIPC"', () => {
    const result = extractor.extract('NIPC 987654321');
    expect(result?.value).toBe('987654321');
  });

  it('extrai com rótulo "Tax ID"', () => {
    const result = extractor.extract('Tax ID: 123456789');
    expect(result?.value).toBe('123456789');
  });

  it('não confunde "vat" dentro de "activate" com um rótulo de NIF/VAT', () => {
    expect(extractor.extract('Please activate your account 123456789')).toBeNull();
  });

  it('devolve null sem rótulo, mesmo com uma sequência de 9 dígitos no texto', () => {
    expect(extractor.extract('Referência 123456789 sem contexto fiscal')).toBeNull();
  });
});
