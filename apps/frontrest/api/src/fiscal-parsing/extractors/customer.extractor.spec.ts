import { CustomerExtractor } from './customer.extractor';
import { FiscalField } from '../types';

describe('CustomerExtractor', () => {
  const extractor = new CustomerExtractor();

  it('declara o campo CUSTOMER', () => {
    expect(extractor.field).toBe(FiscalField.CUSTOMER);
  });

  it('extrai o nome com rótulo "Cliente:"', () => {
    const result = extractor.extract('Cliente: Restaurante Sabor Único, Lda');
    expect(result).toEqual({
      value: { name: 'Restaurante Sabor Único, Lda' },
      confidence: 85,
      source: expect.stringContaining('Restaurante Sabor Único, Lda'),
    });
  });

  it('extrai o nome com rótulo "Bill To:"', () => {
    const result = extractor.extract('Bill To: Acme Corp');
    expect(result?.value).toEqual({ name: 'Acme Corp' });
  });

  it('extrai o nome com rótulo "Customer:"', () => {
    const result = extractor.extract('Customer: Acme Corp');
    expect(result?.value).toEqual({ name: 'Acme Corp' });
  });

  it('extrai o nome com rótulo "Sold To:"', () => {
    const result = extractor.extract('Sold To: Acme Corp');
    expect(result?.value).toEqual({ name: 'Acme Corp' });
  });

  it('extrai o nome com a saudação formal PT "Exmo(s). Sr(s):"', () => {
    const result = extractor.extract('Exmo(s). Sr(s): Restaurante Sabor Único, Lda');
    expect(result?.value).toEqual({ name: 'Restaurante Sabor Único, Lda' });
  });

  it('não tem fallback — devolve null sem rótulo, mesmo com texto presente', () => {
    expect(extractor.extract('Restaurante Sabor Único, Lda\nRua Principal, 123')).toBeNull();
  });
});
