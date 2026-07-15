import { TaxNumberExtractor } from './tax-number.extractor';
import { FiscalField } from '../types';

describe('TaxNumberExtractor', () => {
  const extractor = new TaxNumberExtractor();

  it('declara o campo SUPPLIER_TAX_ID', async () => {
    expect(extractor.field).toBe(FiscalField.SUPPLIER_TAX_ID);
  });

  it('extrai um NIF português (9 dígitos) com rótulo "NIF"', async () => {
    const result = await extractor.extract('NIF: 123456789');
    expect(result).toEqual({ value: '123456789', confidence: 90, source: expect.stringContaining('123456789') });
  });

  it('extrai um VAT intracomunitário com prefixo de país', async () => {
    const result = await extractor.extract('VAT Number: PT123456789');
    expect(result?.value).toBe('PT123456789');
  });

  it('extrai com rótulo "NIPC"', async () => {
    const result = await extractor.extract('NIPC 987654321');
    expect(result?.value).toBe('987654321');
  });

  it('extrai com rótulo "Tax ID"', async () => {
    const result = await extractor.extract('Tax ID: 123456789');
    expect(result?.value).toBe('123456789');
  });

  it('não confunde "vat" dentro de "activate" com um rótulo de NIF/VAT', async () => {
    expect(await extractor.extract('Please activate your account 123456789')).toBeNull();
  });

  it('devolve null sem rótulo, mesmo com uma sequência de 9 dígitos no texto', async () => {
    expect(await extractor.extract('Referência 123456789 sem contexto fiscal')).toBeNull();
  });

  describe('normalização de confusões de OCR (achado real, "Farmácia Esperança")', () => {
    it('reconhece "NTF" como confusão de OCR de "NIF" (I↔T)', async () => {
      const result = await extractor.extract('609978142 NTF 509978142');
      expect(result?.value).toBe('509978142');
    });

    it('recupera um NIF com "O" no lugar de "0"', async () => {
      const result = await extractor.extract('NIF: 5O9978142');
      expect(result?.value).toBe('509978142');
    });

    it('recupera um NIF com "I"/"l" no lugar de "1"', async () => {
      const result = await extractor.extract('NIF: 5Il978142');
      expect(result?.value).toBe('511978142');
    });

    it('devolve null quando a normalização não produz um número totalmente válido', async () => {
      // "X" não está no conjunto de letras confundíveis com dígitos —
      // nunca inventa um valor a partir de ruído não reconhecido.
      expect(await extractor.extract('NIF: 5X9978142')).toBeNull();
    });
  });
});
