import { TotalsExtractor } from './totals.extractor';
import { FiscalField } from '../types';

describe('TotalsExtractor', () => {
  const extractor = new TotalsExtractor();

  it('declara o campo TOTALS', () => {
    expect(extractor.field).toBe(FiscalField.TOTALS);
  });

  it('extrai o total com rótulo "Total a Pagar"', () => {
    const result = extractor.extract('Total a Pagar: 45,90€');
    expect(result?.value).toEqual({ totalAmount: 45.9 });
    expect(result?.confidence).toBe(80);
  });

  it('extrai o total com rótulo "Total" simples', () => {
    const result = extractor.extract('Subtotal: 40,00€\nIVA: 5,90€\nTotal: 45,90€');
    expect(result?.value).toEqual({ totalAmount: 45.9 });
  });

  it('extrai o total com rótulo "Grand Total" em formato EN', () => {
    const result = extractor.extract('Grand Total: $1,234.56');
    expect(result?.value).toEqual({ totalAmount: 1234.56 });
  });

  it('extrai o total com rótulo "Valor Total"', () => {
    const result = extractor.extract('Valor Total: 100,00€');
    expect(result?.value).toEqual({ totalAmount: 100 });
  });

  it('não confunde "Total do IVA" com o total da fatura', () => {
    expect(extractor.extract('Total do IVA: 4,60€')).toBeNull();
  });

  it('devolve null quando não há total', () => {
    expect(extractor.extract('Documento sem valores')).toBeNull();
  });
});
