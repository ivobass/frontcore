import { Injectable } from '@nestjs/common';
import type { FiscalExtractor } from '../contracts';
import type { ExtractionMatch, VatExtraction } from '../types';
import { FiscalField } from '../types';
import { parseAmount } from '../utils';

// \b antes de "iva"/"vat" impede falsos positivos em palavras que
// contêm essas letras por coincidência (ex. "activate" contém "vat").
const RATE_AND_AMOUNT =
  /\b(?:iva|vat)\D{0,10}?(\d{1,2}(?:[.,]\d)?)\s*%[^\d]{0,10}?([€$£]?\s?[\d][\d.,]*)/i;
const RATE_ONLY = /\b(?:iva|vat)\D{0,10}?(\d{1,2}(?:[.,]\d)?)\s*%/i;
// Exige o símbolo monetário para o valor-só, para não confundir com a
// taxa (ex. "IVA 23" sem % não deve ser lido como montante de 23). O
// símbolo pode vir antes ou depois do valor — convenção PT/EU comum é
// "12,34€" (símbolo depois), não "€12,34".
const AMOUNT_ONLY = /\b(?:iva|vat)\s*[:.\-]?\s*([\d][\d.,]*\s?[€$£]|[€$£]\s?[\d][\d.,]*)/i;

/**
 * Extrai a linha de IVA/VAT — taxa e/ou montante. Tenta, por ordem,
 * "taxa + montante" (ex. "IVA (23%): 12,34€"), depois só taxa, depois
 * só montante — a primeira que corresponder define o resultado.
 */
@Injectable()
export class VatExtractor implements FiscalExtractor<VatExtraction> {
  readonly field = FiscalField.VAT;

  extract(ocrText: string): ExtractionMatch<VatExtraction> | null {
    const both = ocrText.match(RATE_AND_AMOUNT);
    if (both) {
      const rate = parseAmount(both[1]);
      const amount = parseAmount(both[2]);
      if (rate !== null && amount !== null) {
        return { value: { rate, amount }, confidence: 85, source: both[0].trim() };
      }
    }

    const rateOnly = ocrText.match(RATE_ONLY);
    if (rateOnly) {
      const rate = parseAmount(rateOnly[1]);
      if (rate !== null) {
        return { value: { rate }, confidence: 70, source: rateOnly[0].trim() };
      }
    }

    const amountOnly = ocrText.match(AMOUNT_ONLY);
    if (amountOnly) {
      const amount = parseAmount(amountOnly[1]);
      if (amount !== null) {
        return { value: { amount }, confidence: 65, source: amountOnly[0].trim() };
      }
    }

    return null;
  }
}
