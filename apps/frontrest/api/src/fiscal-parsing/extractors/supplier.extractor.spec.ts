import { SupplierExtractor } from './supplier.extractor';
import { FiscalField } from '../types';

describe('SupplierExtractor', () => {
  const extractor = new SupplierExtractor();

  it('declara o campo SUPPLIER', () => {
    expect(extractor.field).toBe(FiscalField.SUPPLIER);
  });

  it('extrai o nome com rótulo "Fornecedor:"', () => {
    const result = extractor.extract('Fornecedor: Acme Distribuição Lda\nFatura N.º FA2026/1');
    expect(result).toEqual({
      value: { name: 'Acme Distribuição Lda' },
      confidence: 85,
      source: expect.stringContaining('Acme Distribuição Lda'),
    });
  });

  it('extrai o nome com rótulo "Supplier:"', () => {
    const result = extractor.extract('Supplier: Global Foods Inc.');
    expect(result?.value).toEqual({ name: 'Global Foods Inc.' });
  });

  it('extrai o nome com rótulo "Emitente:"', () => {
    const result = extractor.extract('Emitente: Padaria Central, Lda');
    expect(result?.value).toEqual({ name: 'Padaria Central, Lda' });
    expect(result?.confidence).toBe(85);
  });

  it('extrai o nome com rótulo "Vendor:"', () => {
    const result = extractor.extract('Vendor: Global Foods Inc.');
    expect(result?.value).toEqual({ name: 'Global Foods Inc.' });
  });

  it('extrai o nome com rótulo "Issued by:"', () => {
    const result = extractor.extract('Issued by: Acme Distribuição Lda');
    expect(result?.value).toEqual({ name: 'Acme Distribuição Lda' });
  });

  it('cai para a primeira linha não vazia quando não há rótulo, com confiança baixa', () => {
    const result = extractor.extract('Acme Distribuição Lda\nRua Principal, 123\nFatura N.º FA2026/1');
    expect(result).toEqual({
      value: { name: 'Acme Distribuição Lda' },
      confidence: 40,
      source: 'Acme Distribuição Lda',
    });
  });

  it('ignora linhas vazias iniciais ao usar o fallback', () => {
    const result = extractor.extract('\n\n  Acme Lda  \nRua Principal, 123');
    expect(result?.value).toEqual({ name: 'Acme Lda' });
  });

  it('devolve null para texto totalmente vazio', () => {
    expect(extractor.extract('')).toBeNull();
  });
});
