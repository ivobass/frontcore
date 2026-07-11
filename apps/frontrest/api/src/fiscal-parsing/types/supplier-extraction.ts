/**
 * Fornecedor identificado no documento. Só o nome — o NIF/VAT é
 * responsabilidade exclusiva de `TaxNumberExtractor` (extractor
 * independente, ver `FiscalExtractionResult.supplierTaxId`), para não
 * haver dois extractors a competir pelo mesmo campo com confiança/fonte
 * potencialmente diferentes.
 */
export interface SupplierExtraction {
  name: string;
}
