import { Injectable } from '@nestjs/common';
import type { FiscalExtractor } from '../contracts';
import type { ExtractionMatch } from '../types';
import { FiscalField } from '../types';

// NIF português: 9 dígitos. VAT intracomunitário: prefixo de país (2
// letras) + 9-12 dígitos (ex. "PT123456789"). Rótulo obrigatório —
// nunca varre o texto à procura de sequências de dígitos sem contexto.
// \b antes do rótulo evita falsos positivos (ex. "vat" dentro de "activate").
const TAX_ID_LABEL =
  /\b(?:nif|nipc|vat\s*(?:number|no\.?|id)?|tax\s*id)\s*[:.\-]?\s*([A-Z]{0,2}\s?\d{9,12})\b/i;

/** Extrai o número de identificação fiscal do fornecedor (NIF/VAT). */
@Injectable()
export class TaxNumberExtractor implements FiscalExtractor<string> {
  readonly field = FiscalField.SUPPLIER_TAX_ID;

  async extract(ocrText: string): Promise<ExtractionMatch<string> | null> {
    const match = ocrText.match(TAX_ID_LABEL);
    if (!match) {
      return null;
    }
    return { value: match[1].replace(/\s+/g, ''), confidence: 90, source: match[0].trim() };
  }
}
