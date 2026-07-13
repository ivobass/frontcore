import { TotalsExtractor } from './totals.extractor';
import { FiscalField } from '../types';

describe('TotalsExtractor', () => {
  const extractor = new TotalsExtractor();

  it('declara o campo TOTALS', async () => {
    expect(extractor.field).toBe(FiscalField.TOTALS);
  });

  it('extrai o total com rótulo "Total a Pagar"', async () => {
    const result = await extractor.extract('Total a Pagar: 45,90€');
    expect(result?.value).toEqual({ totalAmount: 45.9 });
    expect(result?.confidence).toBe(80);
  });

  it('extrai o total com rótulo "Total" simples', async () => {
    const result = await extractor.extract('Subtotal: 40,00€\nIVA: 5,90€\nTotal: 45,90€');
    expect(result?.value).toEqual({ totalAmount: 45.9 });
  });

  it('extrai o total com rótulo "Grand Total" em formato EN', async () => {
    const result = await extractor.extract('Grand Total: $1,234.56');
    expect(result?.value).toEqual({ totalAmount: 1234.56 });
  });

  it('extrai o total com rótulo "Valor Total"', async () => {
    const result = await extractor.extract('Valor Total: 100,00€');
    expect(result?.value).toEqual({ totalAmount: 100 });
  });

  it('não confunde "Total do IVA" com o total da fatura', async () => {
    expect(await extractor.extract('Total do IVA: 4,60€')).toBeNull();
  });

  it('devolve null quando não há total', async () => {
    expect(await extractor.extract('Documento sem valores')).toBeNull();
  });
});
