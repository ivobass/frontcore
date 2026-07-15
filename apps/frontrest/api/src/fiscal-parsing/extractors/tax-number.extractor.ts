import { Injectable } from '@nestjs/common';
import type { FiscalExtractor } from '../contracts';
import type { ExtractionMatch } from '../types';
import { FiscalField } from '../types';
import { normalizeOcrDigits, DIGIT_LIKE_CLASS } from '../utils';

// NIF português: 9 dígitos. VAT intracomunitário: prefixo de país (2
// letras) + 9-12 dígitos (ex. "PT123456789"). Rótulo obrigatório —
// nunca varre o texto à procura de sequências de dígitos sem contexto.
// \b antes do rótulo evita falsos positivos (ex. "vat" dentro de "activate").
//
// "ntf" — achado real (validação manual, "Farmácia Esperança"): o OCR
// devolveu literalmente "NTF" em vez de "NIF" (confusão I↔T). Alternativa
// explícita, não uma classe de carateres genérica sobre o rótulo inteiro
// — sem mais evidência de outras confusões concretas em "NIF"/"NIPC",
// alargar mais seria especular.
//
// A captura aceita letras confundíveis com dígitos (`DIGIT_LIKE_CLASS`/
// `normalizeOcrDigits`) no corpo do número, não só dígitos — ex. um NIF
// real lido como "5O9978142". Nunca inventa um dígito a partir de nada:
// só troca um caráter já presente, e o resultado é validado como
// puramente numérico com 9-12 carateres antes de ser aceite
// (`isValidTaxId`) — se a normalização não produzir um número válido,
// devolve `null` em vez de arriscar um NIF errado.
const TAX_ID_LABEL = new RegExp(
  `\\b(?:nif|ntf|nipc|vat\\s*(?:number|no\\.?|id)?|tax\\s*id)\\s*[:.\\-]?\\s*` +
    `([A-Z]{0,2}\\s?${DIGIT_LIKE_CLASS}{9,12})\\b`,
  'i',
);

function isValidTaxId(digits: string): boolean {
  return /^\d{9,12}$/.test(digits);
}

/** Extrai o número de identificação fiscal do fornecedor (NIF/VAT). */
@Injectable()
export class TaxNumberExtractor implements FiscalExtractor<string> {
  readonly field = FiscalField.SUPPLIER_TAX_ID;

  async extract(ocrText: string): Promise<ExtractionMatch<string> | null> {
    const match = ocrText.match(TAX_ID_LABEL);
    if (!match) {
      return null;
    }

    const raw = match[1].replace(/\s+/g, '');
    const [, prefix, body] = /^([A-Z]{0,2})(.*)$/i.exec(raw) ?? [];
    const digits = normalizeOcrDigits(body ?? raw);
    if (!isValidTaxId(digits)) {
      return null;
    }

    return {
      value: `${(prefix ?? '').toUpperCase()}${digits}`,
      confidence: 90,
      source: match[0].trim(),
    };
  }
}
