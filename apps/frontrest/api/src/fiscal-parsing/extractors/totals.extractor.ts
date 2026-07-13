import { Injectable } from '@nestjs/common';
import type { FiscalExtractor } from '../contracts';
import type { ExtractionMatch, TotalsExtraction } from '../types';
import { FiscalField } from '../types';
import { parseAmount } from '../utils';

// \b antes de "total" impede que "Subtotal" seja lido como "Total" (não
// há fronteira de palavra entre "Sub" e "total" nessa palavra, logo
// \btotal\b nunca casa aí). A expressão também exige o montante logo a
// seguir ao rótulo (só pontuação/espaço entre eles) — "Total do IVA:
// 4,60€" não corresponde, porque "do IVA:" fica entre "Total" e o valor.
const TOTALS_LABEL =
  /(?:grand\s*total|valor\s*total|\btotal\b)\s*(?:a\s*pagar|geral|amount\s*due)?\s*[:.\-]?\s*([€$£]?\s?[\d][\d.,]*)/i;

/** Extrai o total final da fatura (ex. "Total a Pagar: 45,90€"). */
@Injectable()
export class TotalsExtractor implements FiscalExtractor<TotalsExtraction> {
  readonly field = FiscalField.TOTALS;

  async extract(ocrText: string): Promise<ExtractionMatch<TotalsExtraction> | null> {
    const match = ocrText.match(TOTALS_LABEL);
    if (!match) {
      return null;
    }
    const totalAmount = parseAmount(match[1]);
    if (totalAmount === null) {
      return null;
    }
    return { value: { totalAmount }, confidence: 80, source: match[0].trim() };
  }
}
