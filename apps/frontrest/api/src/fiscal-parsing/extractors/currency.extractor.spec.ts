import { CurrencyExtractor } from './currency.extractor';
import { FiscalField } from '../types';

describe('CurrencyExtractor', () => {
  const extractor = new CurrencyExtractor();

  it('declara o campo CURRENCY', async () => {
    expect(extractor.field).toBe(FiscalField.CURRENCY);
  });

  it('extrai a moeda com rótulo explícito "Moeda:"', async () => {
    const result = await extractor.extract('Moeda: EUR');
    expect(result).toEqual({ value: 'EUR', confidence: 85, source: expect.stringContaining('EUR') });
  });

  it('extrai a moeda com rótulo "Currency:"', async () => {
    const result = await extractor.extract('Currency: USD');
    expect(result?.value).toBe('USD');
  });

  it('infere EUR a partir do símbolo € quando não há rótulo', async () => {
    const result = await extractor.extract('Total: 45,90€');
    expect(result).toEqual({ value: 'EUR', confidence: 50, source: '€' });
  });

  it('infere USD a partir do símbolo $ quando não há rótulo', async () => {
    const result = await extractor.extract('Total: $45.90');
    expect(result?.value).toBe('USD');
  });

  it('rótulo explícito tem prioridade sobre o símbolo', async () => {
    const result = await extractor.extract('Moeda: USD — Total: 45,90€');
    expect(result?.value).toBe('USD');
    expect(result?.confidence).toBe(85);
  });

  it('devolve null quando não há rótulo nem símbolo monetário', async () => {
    expect(await extractor.extract('Total: 45,90')).toBeNull();
  });
});
