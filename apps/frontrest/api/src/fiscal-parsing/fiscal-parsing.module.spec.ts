import { Test } from '@nestjs/testing';
import { FiscalParsingModule } from './fiscal-parsing.module';
import { FiscalParsingService } from './fiscal-parsing.service';

/**
 * Único ponto que exercita a resolução real de DI do módulo — todos os
 * outros testes de `FiscalParsingService` constroem a service à mão com
 * um array de extractors, o que nunca provaria que `FISCAL_EXTRACTORS`
 * está corretamente ligado a `FiscalParsingService` através do
 * container do NestJS (ex. uma ordem trocada entre `providers` e
 * `inject`, ou um extractor esquecido no módulo).
 */
describe('FiscalParsingModule', () => {
  it('resolve FiscalParsingService com os 9 extractors ligados via DI real, não construção manual', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [FiscalParsingModule] }).compile();
    const service = moduleRef.get(FiscalParsingService);

    const result = await service.parse(
      'Fornecedor: Acme\nNIF: 123456789\nCliente: X\nFatura N.º: FA1\nData de Emissão: 12/07/2026\nData de Vencimento: 30/07/2026\nIVA (23%): 2,30€\nTotal: 10,00€',
    );

    expect(result.metadata.extractorsRun).toHaveLength(9);
    expect(result.supplier?.value).toEqual({ name: 'Acme' });
    expect(result.supplierTaxId?.value).toBe('123456789');
    expect(result.customer?.value).toEqual({ name: 'X' });
    expect(result.invoice.number?.value).toBe('FA1');
    expect(result.invoice.issueDate).not.toBeNull();
    expect(result.invoice.dueDate).not.toBeNull();
    expect(result.invoice.currency?.value).toBe('EUR');
    expect(result.totals?.value).toEqual({ totalAmount: 10 });
    expect(result.vat?.value).toEqual({ rate: 23, amount: 2.3 });
  });
});
