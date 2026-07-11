import { Injectable } from '@nestjs/common';
import type { FiscalExtractor } from '../contracts';
import type { ExtractionMatch } from '../types';
import { FiscalField } from '../types';

// Exige a palavra-chave "fatura"/"factura"/"invoice" próxima de um
// sub-rótulo de número — evita apanhar um "Nº" solto (ex. telefone).
// "number"/"no." vêm antes da forma abreviada "n.º" na alternação para
// serem tentados primeiro; a forma abreviada só se aplica se as duas
// anteriores falharem, e o "(?![a-zA-Z])" a seguir impede-a de casar só
// com o "N" inicial de uma palavra maior como "Number" (sem essa
// proteção, "N" sozinho já satisfaz o resto do grupo, todo opcional).
const INVOICE_NUMBER_PATTERN =
  /(?:fatura|factura|invoice)[^\n]{0,20}?(?:number|no\.?|n\.?\s?[º°o]?\.?(?![a-zA-Z])|#)[\s:.\-#]*([A-Z0-9][A-Z0-9/.\-]{2,24})/i;

/** Extrai o número/identificador da fatura (ex. "Fatura N.º FA2026/123"). */
@Injectable()
export class InvoiceNumberExtractor implements FiscalExtractor<string> {
  readonly field = FiscalField.INVOICE_NUMBER;

  extract(ocrText: string): ExtractionMatch<string> | null {
    const match = ocrText.match(INVOICE_NUMBER_PATTERN);
    if (!match) {
      return null;
    }
    return { value: match[1], confidence: 85, source: match[0].trim() };
  }
}
