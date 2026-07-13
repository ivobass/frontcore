import { InvoiceNumberExtractor } from './invoice-number.extractor';
import { FiscalField } from '../types';

describe('InvoiceNumberExtractor', () => {
  const extractor = new InvoiceNumberExtractor();

  it('declara o campo INVOICE_NUMBER', async () => {
    expect(extractor.field).toBe(FiscalField.INVOICE_NUMBER);
  });

  it('extrai o número com rótulo "Fatura N.º"', async () => {
    const result = await extractor.extract('Fatura N.º: FA2026/123\nData: 12/07/2026');
    expect(result).toEqual({
      value: 'FA2026/123',
      confidence: 85,
      source: expect.stringContaining('FA2026/123'),
    });
  });

  it('extrai o número com rótulo "Invoice Number"', async () => {
    const result = await extractor.extract('Invoice Number: INV-00123');
    expect(result?.value).toBe('INV-00123');
  });

  it('extrai o número com "Invoice #"', async () => {
    const result = await extractor.extract('Invoice #A12345');
    expect(result?.value).toBe('A12345');
  });

  it('extrai o número com rótulo "Factura N.º" (variante ortográfica)', async () => {
    const result = await extractor.extract('Factura N.º: FT2026/9');
    expect(result?.value).toBe('FT2026/9');
  });

  it('devolve null quando não há rótulo de fatura/invoice', async () => {
    expect(await extractor.extract('Nº de telefone: 912345678')).toBeNull();
  });

  it('devolve null para texto sem número de fatura', async () => {
    expect(await extractor.extract('Documento sem identificação')).toBeNull();
  });
});
