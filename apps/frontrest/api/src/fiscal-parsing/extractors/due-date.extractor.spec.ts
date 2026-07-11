import { DueDateExtractor } from './due-date.extractor';
import { FiscalField } from '../types';

describe('DueDateExtractor', () => {
  const extractor = new DueDateExtractor();

  it('declara o campo DUE_DATE', () => {
    expect(extractor.field).toBe(FiscalField.DUE_DATE);
  });

  it('extrai a data com rótulo "Data de Vencimento"', () => {
    const result = extractor.extract('Data de Vencimento: 30/07/2026');
    expect(result?.value.toISOString()).toBe('2026-07-30T00:00:00.000Z');
    expect(result?.confidence).toBe(80);
  });

  it('extrai a data com rótulo "Vencimento" simples', () => {
    const result = extractor.extract('Vencimento: 30/07/2026');
    expect(result?.value.toISOString()).toBe('2026-07-30T00:00:00.000Z');
  });

  it('extrai a data com rótulo "Due Date"', () => {
    const result = extractor.extract('Due Date: 2026-07-30');
    expect(result?.value.toISOString()).toBe('2026-07-30T00:00:00.000Z');
  });

  it('extrai a data com rótulo "Payment Due"', () => {
    const result = extractor.extract('Payment Due: 30/07/2026');
    expect(result?.value.toISOString()).toBe('2026-07-30T00:00:00.000Z');
  });

  it('não confunde "Data de Emissão" com data de vencimento', () => {
    expect(extractor.extract('Data de Emissão: 12/07/2026')).toBeNull();
  });

  it('devolve null quando não há data de vencimento', () => {
    expect(extractor.extract('Documento sem vencimento')).toBeNull();
  });
});
