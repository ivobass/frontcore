import { FiscalParsingService } from './fiscal-parsing.service';
import type { FiscalExtractor } from './contracts';
import { FiscalField } from './types';
import type { ExtractionMatch, FiscalExtractionResult } from './types';
import {
  SupplierExtractor,
  CustomerExtractor,
  InvoiceNumberExtractor,
  InvoiceDateExtractor,
  DueDateExtractor,
  CurrencyExtractor,
  TotalsExtractor,
  VatExtractor,
  TaxNumberExtractor,
} from './extractors';

function buildService(): FiscalParsingService {
  return new FiscalParsingService([
    new SupplierExtractor(),
    new TaxNumberExtractor(),
    new CustomerExtractor(),
    new InvoiceNumberExtractor(),
    new InvoiceDateExtractor(),
    new DueDateExtractor(),
    new CurrencyExtractor(),
    new TotalsExtractor(),
    new VatExtractor(),
  ]);
}

function stubExtractor<T>(field: FiscalField, match: ExtractionMatch<T> | null): FiscalExtractor<T> {
  return { field, extract: async () => match };
}

const REALISTIC_INVOICE = `Acme Distribuição Lda
Fornecedor: Acme Distribuição Lda
NIF: 123456789
Cliente: Restaurante Sabor Único, Lda

Fatura N.º: FA2026/1042
Data de Emissão: 12/07/2026
Data de Vencimento: 30/07/2026

Subtotal: 40,00€
IVA (23%): 9,20€
Total a Pagar: 49,20€`;

describe('FiscalParsingService', () => {
  const service = buildService();

  describe('parse — documento completo e bem formado', () => {
    let result: FiscalExtractionResult;

    beforeAll(async () => {
      result = await service.parse(REALISTIC_INVOICE);
    });

    it('extrai o fornecedor pelo rótulo explícito', () => {
      expect(result.supplier?.value).toEqual({ name: 'Acme Distribuição Lda' });
      expect(result.supplier?.confidence).toBe(85);
    });

    it('extrai o NIF do fornecedor', () => {
      expect(result.supplierTaxId?.value).toBe('123456789');
    });

    it('extrai o cliente', () => {
      expect(result.customer?.value).toEqual({ name: 'Restaurante Sabor Único, Lda' });
    });

    it('extrai o número, datas e moeda da fatura', () => {
      expect(result.invoice.number?.value).toBe('FA2026/1042');
      expect(result.invoice.issueDate?.value.toISOString()).toBe('2026-07-12T00:00:00.000Z');
      expect(result.invoice.dueDate?.value.toISOString()).toBe('2026-07-30T00:00:00.000Z');
      expect(result.invoice.currency?.value).toBe('EUR');
    });

    it('extrai o total (não o subtotal)', () => {
      expect(result.totals?.value).toEqual({ totalAmount: 49.2 });
    });

    it('extrai a taxa e o montante de IVA', () => {
      expect(result.vat?.value).toEqual({ rate: 23, amount: 9.2 });
    });

    it('calcula a confiança agregada como a média dos campos encontrados', () => {
      const expectedAverage = Math.round(
        (85 + 90 + 85 + 85 + 80 + 80 + 50 + 80 + 85) / 9,
      );
      expect(result.confidence).toBe(expectedAverage);
    });

    it('preenche metadata com todos os extractors corridos e os campos encontrados', () => {
      expect(result.metadata.extractorsRun).toHaveLength(9);
      expect(result.metadata.fieldsFound).toHaveLength(9);
      expect(result.metadata.fieldsFound).toEqual(expect.arrayContaining(Object.values(FiscalField)));
      expect(result.metadata.textLength).toBe(REALISTIC_INVOICE.length);
      expect(result.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('parse — texto sem nenhuma informação fiscal reconhecível', () => {
    it('só o fornecedor é encontrado (fallback de 1ª linha, confiança baixa) — todos os outros campos null', async () => {
      const result = await service.parse('texto sem qualquer informação fiscal reconhecível');

      // SupplierExtractor nunca devolve null para texto não vazio — cai
      // sempre para a heurística de fallback (ver supplier.extractor.ts).
      expect(result.supplier).toEqual({
        value: { name: 'texto sem qualquer informação fiscal reconhecível' },
        confidence: 40,
        source: 'texto sem qualquer informação fiscal reconhecível',
      });
      expect(result.supplierTaxId).toBeNull();
      expect(result.customer).toBeNull();
      expect(result.invoice).toEqual({ number: null, issueDate: null, dueDate: null, currency: null });
      expect(result.totals).toBeNull();
      expect(result.vat).toBeNull();
      expect(result.confidence).toBe(40);
      expect(result.metadata.fieldsFound).toEqual([FiscalField.SUPPLIER]);
    });

    it('devolve absolutamente todos os campos null e confiança 0 para texto vazio (nem o fallback do fornecedor encontra uma 1ª linha)', async () => {
      const result = await service.parse('');

      expect(result.supplier).toBeNull();
      expect(result.supplierTaxId).toBeNull();
      expect(result.customer).toBeNull();
      expect(result.invoice).toEqual({ number: null, issueDate: null, dueDate: null, currency: null });
      expect(result.totals).toBeNull();
      expect(result.vat).toBeNull();
      expect(result.confidence).toBe(0);
      expect(result.metadata.fieldsFound).toHaveLength(0);
    });

    it('não lança para texto vazio', async () => {
      await expect(service.parse('')).resolves.not.toThrow();
    });
  });

  describe('parse — documento parcial (só alguns campos presentes)', () => {
    it('devolve null apenas para os campos não encontrados, preservando os restantes', async () => {
      const result = await service.parse('Fatura N.º: FA2026/1\nTotal a Pagar: 100,00€');

      expect(result.invoice.number?.value).toBe('FA2026/1');
      expect(result.totals?.value).toEqual({ totalAmount: 100 });
      expect(result.customer).toBeNull();
      expect(result.vat).toBeNull();
      expect(result.invoice.issueDate).toBeNull();
      expect(result.invoice.dueDate).toBeNull();
    });
  });

  describe('independência dos extractors', () => {
    it('cada extractor corre sobre o mesmo texto de forma isolada — um extractor lançar não é possível aqui, mas um "null" de um não afeta os outros', async () => {
      const result = await service.parse('Cliente: Restaurante Sabor Único, Lda');

      expect(result.customer?.value).toEqual({ name: 'Restaurante Sabor Único, Lda' });
      // SupplierExtractor cai para a heurística de fallback (primeira
      // linha), que aqui é a própria linha do cliente — demonstra que os
      // extractors não partilham estado nem se corrigem mutuamente.
      expect(result.supplier?.value).toEqual({ name: 'Cliente: Restaurante Sabor Único, Lda' });
      expect(result.supplier?.confidence).toBe(40);
    });
  });

  describe('vários extractors a competir pelo mesmo campo (ex. um extractor por país no futuro)', () => {
    it('vence o de maior confiança, independentemente da ordem de registo', async () => {
      const weak: FiscalExtractor<string> = stubExtractor(FiscalField.SUPPLIER_TAX_ID, {
        value: 'FRACO',
        confidence: 30,
        source: 'fraco',
      });
      const strong: FiscalExtractor<string> = stubExtractor(FiscalField.SUPPLIER_TAX_ID, {
        value: 'FORTE',
        confidence: 95,
        source: 'forte',
      });

      const weakFirst = await new FiscalParsingService([weak, strong]).parse('qualquer texto');
      const strongFirst = await new FiscalParsingService([strong, weak]).parse('qualquer texto');

      expect(weakFirst.supplierTaxId).toEqual({ value: 'FORTE', confidence: 95, source: 'forte' });
      expect(strongFirst.supplierTaxId).toEqual({ value: 'FORTE', confidence: 95, source: 'forte' });
    });

    it('em empate exato de confiança, vence o primeiro extractor a ser registado (regra determinística, não arbitrária)', async () => {
      const first: FiscalExtractor<string> = stubExtractor(FiscalField.SUPPLIER_TAX_ID, {
        value: 'PRIMEIRO',
        confidence: 80,
        source: 'primeiro',
      });
      const second: FiscalExtractor<string> = stubExtractor(FiscalField.SUPPLIER_TAX_ID, {
        value: 'SEGUNDO',
        confidence: 80,
        source: 'segundo',
      });

      const result = await new FiscalParsingService([first, second]).parse('qualquer texto');

      expect(result.supplierTaxId?.value).toBe('PRIMEIRO');
    });

    it('metadata.fieldsFound não duplica o campo mesmo com dois extractors a alimentá-lo', async () => {
      const a = stubExtractor(FiscalField.CURRENCY, { value: 'EUR', confidence: 50, source: 'a' });
      const b = stubExtractor(FiscalField.CURRENCY, { value: 'EUR', confidence: 85, source: 'b' });

      const result = await new FiscalParsingService([a, b]).parse('qualquer texto');

      expect(result.metadata.fieldsFound).toEqual([FiscalField.CURRENCY]);
    });
  });
});
