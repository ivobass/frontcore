import { Injectable } from '@nestjs/common';
import type { FiscalExtractor } from '../contracts';
import type { ExtractionMatch } from '../types';
import { FiscalField } from '../types';
import { parseFlexibleDate } from '../utils';

const DUE_DATE_LABEL =
  /(?:data\s*(?:de\s*)?vencimento|vencimento|due\s*date|payment\s*due|data\s*limite\s*(?:de\s*pagamento)?)\s*[:.\-]?\s*(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/\-.]\d{1,2}[/\-.]\d{4})/i;

/** Extrai a data de vencimento/pagamento (ex. "Vencimento: 30/07/2026"). */
@Injectable()
export class DueDateExtractor implements FiscalExtractor<Date> {
  readonly field = FiscalField.DUE_DATE;

  extract(ocrText: string): ExtractionMatch<Date> | null {
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
