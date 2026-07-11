import { InvoiceNumberExtractor } from './invoice-number.extractor';
import { FiscalField } from '../types';

describe('InvoiceNumberExtractor', () => {
  const extractor = new InvoiceNumberExtractor();

  it('declara o campo INVOICE_NUMBER', () => {
    expect(extractor.field).toBe(FiscalField.INVOICE_NUMBER);
  });

  it('extrai o número com rótulo "Fatura N.º"', () => {
    const result = extractor.extract('Fatura N.º: FA2026/123\nData: 12/07/2026');
    expect(result).toEqual({
      value: 'FA2026/123',
      confidence: 85,
      source: expect.stringContaining('FA2026/123'),
    });
  });

  it('extrai o número com rótulo "Invoice Number"', () => {
    const result = extractor.extract('Invoice Number: INV-00123');
    expect(result?.value).toBe('INV-00123');
  });

  it('extrai o número com "Invoice #"', () => {
    const result = extractor.extract('Invoice #A12345');
    expect(result?.value).toBe('A12345');
  });

  it('extrai o número com rótulo "Factura N.º" (variante ortográfica)', () => {
    const result = extractor.extract('Factura N.º: FT2026/9');
    expect(result?.value).toBe('FT2026/9');
  });

  it('devolve null quando não há rótulo de fatura/invoice', () => {
    expect(extractor.extract('Nº de telefone: 912345678')).toBeNull();
  });

  it('devolve null para texto sem número de fatura', () => {
    expect(extractor.extract('Documento sem identificação')).toBeNull();
  });
});
