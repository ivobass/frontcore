import type { ExtractionMatch } from './extraction-match';
import type { SupplierExtraction } from './supplier-extraction';
import type { CustomerExtraction } from './customer-extraction';
import type { InvoiceExtraction } from './invoice-extraction';
import type { TotalsExtraction } from './totals-extraction';
import type { VatExtraction } from './vat-extraction';
import type { FiscalField } from './fiscal-field';

/**
 * Diagnóstico do processamento — nunca duplica confiança/fonte por
 * campo (já vive em cada `ExtractionMatch` do resultado); só informação
 * sobre a execução do pipeline em si.
 */
export interface FiscalExtractionMetadata {
  /**
   * Um elemento por extractor corrido (`this.extractors.map(e => e.field)`),
   * não por campo único — se dois extractors partilharem `field` (ex.
   * dois candidatos por país), o mesmo `FiscalField` aparece duas vezes
   * aqui. Para os campos únicos efetivamente encontrados, ver `fieldsFound`.
   */
  extractorsRun: FiscalField[];
  /** Campos únicos com pelo menos um match — nunca duplica, mesmo que vários extractors partilhem o campo. */
  fieldsFound: FiscalField[];
  processingTimeMs: number;
  /** Comprimento do texto OCR de entrada — diagnóstico de qualidade do input. */
  textLength: number;
}

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
