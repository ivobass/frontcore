/**
 * Identificador estável de cada campo que o pipeline de parsing fiscal
 * sabe extrair — usado para associar o resultado de um `FiscalExtractor`
 * ao lugar correto em `FiscalExtractionResult`, e como chave em
 * `FiscalExtractionMetadata`. Adicionar um extractor novo começa por
 * adicionar aqui o campo que ele passa a cobrir.
 */
export enum FiscalField {
  SUPPLIER = 'supplier',
  SUPPLIER_TAX_ID = 'supplierTaxId',
  CUSTOMER = 'customer',
  INVOICE_NUMBER = 'invoiceNumber',
  INVOICE_DATE = 'invoiceDate',
  DUE_DATE = 'dueDate',
  CURRENCY = 'currency',
  TOTALS = 'totals',
  VAT = 'vat',
}
