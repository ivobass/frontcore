import { readFileSync } from 'fs';
import { join } from 'path';
import { FiscalParsingService } from './fiscal-parsing.service';
import {
  SupplierExtractor,
  TaxNumberExtractor,
  CustomerExtractor,
  InvoiceNumberExtractor,
  InvoiceDateExtractor,
  DueDateExtractor,
  CurrencyExtractor,
  TotalsExtractor,
  VatExtractor,
} from './extractors';
import { REGRESSION_FIXTURES } from './__fixtures__/fixtures';
import type { RegressionExpectation } from './__fixtures__/fixtures';
import type { FiscalExtractionResult } from './types';

/**
 * Document Regression Test Suite (Fase 6.13) — protege o pipeline
 * `ocrText → FiscalExtractionResult` contra regressões reais, usando
 * texto OCR de documentos já validados manualmente (ver
 * `docs/phases/phase-6.13-document-regression-test-suite.md`).
 *
 * Deliberadamente separada de `fiscal-parsing.service.spec.ts` (que
 * continua com os seus próprios testes de comportamento/exemplo,
 * inalterados) — esta suite existe só para "documento real X → resultado
 * Y", um teste por documento, gerado por `describe.each` sobre
 * `REGRESSION_FIXTURES` (Jest nativo, sem runner novo).
 *
 * Testa só `ocrText` congelado, nunca o PDF/imagem original nem OCR
 * real — determinístico e rápido por desenho; a qualidade do OCR em si
 * tem a sua própria suite em `packages/ocr`.
 *
 * `expected` é sempre a baseline atual confirmada, nunca o resultado
 * ideal — ver "Baseline" no documento da fase.
 */
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

function summarize(result: FiscalExtractionResult): RegressionExpectation {
  return {
    supplierName: result.supplier?.value.name ?? null,
    supplierConfidence: result.supplier?.confidence ?? null,
    supplierTaxId: result.supplierTaxId?.value ?? null,
    customerName: result.customer?.value.name ?? null,
    invoiceNumber: result.invoice.number?.value ?? null,
    issueDate: result.invoice.issueDate ? result.invoice.issueDate.value.toISOString() : null,
    dueDate: result.invoice.dueDate ? result.invoice.dueDate.value.toISOString() : null,
    currency: result.invoice.currency?.value ?? null,
    totalAmount: result.totals?.value.totalAmount ?? null,
    vatRate: result.vat?.value.rate ?? null,
    vatAmount: result.vat?.value.amount ?? null,
  };
}

describe('Document Regression Test Suite (Fase 6.13)', () => {
  const service = buildService();

  describe.each(REGRESSION_FIXTURES)('$name', (fixture) => {
    it(`protege: ${fixture.reason}`, async () => {
      const ocrText = readFileSync(join(__dirname, '__fixtures__', fixture.file), 'utf8');

      const result = await service.parse(ocrText);

      expect(summarize(result)).toEqual(fixture.expected);
    });
  });
});
