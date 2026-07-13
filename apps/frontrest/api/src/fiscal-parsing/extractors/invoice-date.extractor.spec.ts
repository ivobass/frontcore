import { InvoiceDateExtractor } from './invoice-date.extractor';
import { FiscalField } from '../types';

describe('InvoiceDateExtractor', () => {
  const extractor = new InvoiceDateExtractor();

  it('declara o campo INVOICE_DATE', async () => {
    expect(extractor.field).toBe(FiscalField.INVOICE_DATE);
  });

  it('extrai a data com rótulo "Data de Emissão"', async () => {
    const result = await extractor.extract('Data de Emissão: 12/07/2026');
    expect(result?.value.toISOString()).toBe('2026-07-12T00:00:00.000Z');
    expect(result?.confidence).toBe(80);
  });

  it('extrai a data com rótulo "Invoice Date" em formato ISO', async () => {
    const result = await extractor.extract('Invoice Date: 2026-07-12');
    expect(result?.value.toISOString()).toBe('2026-07-12T00:00:00.000Z');
  });

  it('extrai a data com rótulo "Date" simples', async () => {
    const result = await extractor.extract('Date: 12/07/2026');
    expect(result?.value.toISOString()).toBe('2026-07-12T00:00:00.000Z');
  });

  it('extrai a data com rótulo "Date of Issue"', async () => {
    const result = await extractor.extract('Date of Issue: 12/07/2026');
    expect(result?.value.toISOString()).toBe('2026-07-12T00:00:00.000Z');
  });

  it('extrai a data com rótulo "Issued on"', async () => {
    const result = await extractor.extract('Issued on: 12/07/2026');
    expect(result?.value.toISOString()).toBe('2026-07-12T00:00:00.000Z');
  });

  it('não confunde "Data de Vencimento" com data de emissão', async () => {
    expect(await extractor.extract('Data de Vencimento: 30/07/2026')).toBeNull();
  });

  it('devolve null quando não há data', async () => {
    expect(await extractor.extract('Documento sem datas')).toBeNull();
  });
});
