import { Injectable } from '@nestjs/common';
import type { FiscalExtractor } from '../contracts';
import type { ExtractionMatch } from '../types';
import { FiscalField } from '../types';
import { parseFlexibleDate, DIGIT_LIKE_CLASS } from '../utils';

// Grupo de data com `DIGIT_LIKE_CLASS`, não `\d` — mesma razão de
// `InvoiceDateExtractor`: sem isto, a tolerância a letras confundíveis
// com dígitos de `parseFlexibleDate` nunca era alcançada (a expressão
// falhava antes, com `\d` puro).
const D = DIGIT_LIKE_CLASS;
const DUE_DATE_LABEL = new RegExp(
  `(?:data\\s*(?:de\\s*)?vencimento|vencimento|due\\s*date|payment\\s*due|data\\s*limite\\s*(?:de\\s*pagamento)?)` +
    `\\s*[:.\\-]?\\s*(${D}{4}-${D}{1,2}-${D}{1,2}|${D}{1,2}[/\\-.]${D}{1,2}[/\\-.]${D}{4})`,
  'i',
);

/** Extrai a data de vencimento/pagamento (ex. "Vencimento: 30/07/2026"). */
@Injectable()
export class DueDateExtractor implements FiscalExtractor<Date> {
  readonly field = FiscalField.DUE_DATE;

  async extract(ocrText: string): Promise<ExtractionMatch<Date> | null> {
    const match = ocrText.match(DUE_DATE_LABEL);
    if (!match) {
      return null;
    }
    const date = parseFlexibleDate(match[1]);
    if (!date) {
      return null;
    }
    return { value: date, confidence: 80, source: match[0].trim() };
  }
}
