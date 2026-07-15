import { Injectable } from '@nestjs/common';
import type { FiscalExtractor } from '../contracts';
import type { ExtractionMatch } from '../types';
import { FiscalField } from '../types';
import { isFutureDate, parseFlexibleDate, DIGIT_LIKE_CLASS } from '../utils';

// O grupo opcional "de emissão" impede que "Data de Vencimento: ..."
// seja apanhado aqui — "de Vencimento" não encaixa nem no grupo
// opcional nem imediatamente antes da data, por isso a expressão falha
// nessa posição (ver DueDateExtractor para o rótulo de vencimento).
//
// O grupo de data usa `DIGIT_LIKE_CLASS`, não `\d` — achado real
// (validação Docker desta fase): `parseFlexibleDate` já tolera letras
// confundíveis com dígitos (ex. "20Z6"), mas só as vê se este rótulo as
// deixar passar até `match[1]` — com `\d` puro, a expressão inteira
// falhava a corresponder antes mesmo de chamar `parseFlexibleDate`,
// anulando essa tolerância por completo. As duas expressões têm de se
// manter alinhadas (mesma classe de carateres).
const D = DIGIT_LIKE_CLASS;
const INVOICE_DATE_LABEL = new RegExp(
  `(?:data\\s*(?:de\\s*emiss[ãa]o)?|date\\s*(?:of\\s*issue)?|invoice\\s*date|issued?\\s*on)` +
    `\\s*[:.\\-]?\\s*(${D}{4}-${D}{1,2}-${D}{1,2}|${D}{1,2}[/\\-.]${D}{1,2}[/\\-.]${D}{4})`,
  'i',
);

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
    // Uma fatura nunca é emitida no futuro — achado real (validação
    // manual, "Farmácia Esperança"): ruído de OCR já produziu datas de
    // emissão décadas à frente. Só aqui, nunca em `DueDateExtractor`
    // (vencimento futuro é o caso normal) — ver `isFutureDate`.
    if (isFutureDate(date)) {
      return null;
    }
    return { value: date, confidence: 80, source: match[0].trim() };
  }
}
