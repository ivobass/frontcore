import { Injectable } from '@nestjs/common';
import type { FiscalExtractor } from '../contracts';
import type { ExtractionMatch } from '../types';
import { FiscalField } from '../types';
import { parseFlexibleDate } from '../utils';

// O grupo opcional "de emissão" impede que "Data de Vencimento: ..."
// seja apanhado aqui — "de Vencimento" não encaixa nem no grupo
// opcional nem imediatamente antes da data, por isso a expressão falha
// nessa posição (ver DueDateExtractor para o rótulo de vencimento).
const INVOICE_DATE_LABEL =
  /(?:data\s*(?:de\s*emiss[ãa]o)?|date\s*(?:of\s*issue)?|invoice\s*date|issued?\s*on)\s*[:.\-]?\s*(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/\-.]\d{1,2}[/\-.]\d{4})/i;

/** Extrai a data de emissão da fatura (ex. "Data de Emissão: 12/07/2026"). */
@Injectable()
export class InvoiceDateExtractor implements FiscalExtractor<Date> {
  readonly field = FiscalField.INVOICE_DATE;

  async extract(ocrText: string): Promise<ExtractionMatch<Date> | null> {
    const match = ocrText.match(INVOICE_DATE_LABEL);
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
