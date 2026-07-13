import { DueDateExtractor } from './due-date.extractor';
import { FiscalField } from '../types';

describe('DueDateExtractor', () => {
  const extractor = new DueDateExtractor();

  it('declara o campo DUE_DATE', async () => {
    expect(extractor.field).toBe(FiscalField.DUE_DATE);
  });

  it('extrai a data com rótulo "Data de Vencimento"', async () => {
    const result = await extractor.extract('Data de Vencimento: 30/07/2026');
    expect(result?.value.toISOString()).toBe('2026-07-30T00:00:00.000Z');
    expect(result?.confidence).toBe(80);
  });

  it('extrai a data com rótulo "Vencimento" simples', async () => {
    const result = await extractor.extract('Vencimento: 30/07/2026');
    expect(result?.value.toISOString()).toBe('2026-07-30T00:00:00.000Z');
  });

  it('extrai a data com rótulo "Due Date"', async () => {
    const result = await extractor.extract('Due Date: 2026-07-30');
    expect(result?.value.toISOString()).toBe('2026-07-30T00:00:00.000Z');
  });

  it('extrai a data com rótulo "Payment Due"', async () => {
    const result = await extractor.extract('Payment Due: 30/07/2026');
    expect(result?.value.toISOString()).toBe('2026-07-30T00:00:00.000Z');
  });

  it('não confunde "Data de Emissão" com data de vencimento', async () => {
    expect(await extractor.extract('Data de Emissão: 12/07/2026')).toBeNull();
  });

  it('devolve null quando não há data de vencimento', async () => {
    expect(await extractor.extract('Documento sem vencimento')).toBeNull();
  });
});
