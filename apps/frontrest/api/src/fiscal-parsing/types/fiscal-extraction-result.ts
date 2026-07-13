import type { DocumentExtractionMetadata, ExtractionMatch } from '../../document-extraction';
import type { SupplierExtraction } from './supplier-extraction';
import type { CustomerExtraction } from './customer-extraction';
import type { InvoiceExtraction } from './invoice-extraction';
import type { TotalsExtraction } from './totals-extraction';
import type { VatExtraction } from './vat-extraction';
import type { FiscalField } from './fiscal-field';

/**
 * Diagnóstico do processamento — especialização de
 * `DocumentExtractionMetadata` (motor genérico, `document-extraction/`)
 * para `FiscalField`. Nunca duplica confiança/fonte por campo (já vive
 * em cada `ExtractionMatch` do resultado); só informação sobre a
 * execução do pipeline em si.
 */
export type FiscalExtractionMetadata = DocumentExtractionMetadata<FiscalField>;

/**
 * Resultado normalizado de uma execução do pipeline de parsing fiscal.
 * Forma estável independente de quantos/quais extractors existem — ver
 * `FiscalParsingService.parse()`.
 */
export interface FiscalExtractionResult {
  supplier: ExtractionMatch<SupplierExtraction> | null;
  /** NIF/VAT do fornecedor — extractor independente do nome, ver `SupplierExtraction`. */
  supplierTaxId: ExtractionMatch<string> | null;
  customer: ExtractionMatch<CustomerExtraction> | null;
  invoice: InvoiceExtraction;
  totals: ExtractionMatch<TotalsExtraction> | null;
  vat: ExtractionMatch<VatExtraction> | null;
  /** Agregado 0–100 de todos os campos encontrados — 0 quando nada foi encontrado. */
  confidence: number;
  metadata: FiscalExtractionMetadata;
}
