import type { ExtractionMatch } from './extraction-match';

/**
 * Metadados de identificação da fatura — cada campo é populado por um
 * extractor independente (`InvoiceNumberExtractor`, `InvoiceDateExtractor`,
 * `DueDateExtractor`, `CurrencyExtractor`), por isso cada um mantém a sua
 * própria confiança/fonte em vez de partilhar uma única.
 */
export interface InvoiceExtraction {
  number: ExtractionMatch<string> | null;
  issueDate: ExtractionMatch<Date> | null;
  dueDate: ExtractionMatch<Date> | null;
  currency: ExtractionMatch<string> | null;
}
