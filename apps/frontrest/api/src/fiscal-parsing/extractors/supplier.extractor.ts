import { Injectable } from '@nestjs/common';
import type { FiscalExtractor } from '../contracts';
import type { ExtractionMatch, SupplierExtraction } from '../types';
import { FiscalField } from '../types';

const SUPPLIER_LABEL = /(?:fornecedor|emitente|supplier|vendor|issued\s*by)\s*[:.\-]\s*([^\n]{2,80})/i;

/**
 * Extrai o nome do fornecedor. Com rótulo explícito ("Fornecedor:"),
 * confiança alta. Sem rótulo, cai para a primeira linha não vazia do
 * texto OCR — heurística comum (o nome do emissor costuma ser o
 * cabeçalho do documento), mas não confirmada por um rótulo, por isso
 * confiança baixa.
 */
@Injectable()
export class SupplierExtractor implements FiscalExtractor<SupplierExtraction> {
  readonly field = FiscalField.SUPPLIER;

  extract(ocrText: string): ExtractionMatch<SupplierExtraction> | null {
    const labelMatch = ocrText.match(SUPPLIER_LABEL);
    if (labelMatch) {
      const name = labelMatch[1].trim();
      if (name) {
        return { value: { name }, confidence: 85, source: labelMatch[0].trim() };
      }
    }

    const firstLine = ocrText
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length >= 2);
    if (firstLine) {
      return { value: { name: firstLine }, confidence: 40, source: firstLine };
    }

    return null;
  }
}
