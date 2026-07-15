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
 * Tabela de discriminação de IVA — convenção standard em faturas-recibo
 * portuguesas: "Taxa | Valor | Valor IVA | Líquido", seguida de uma
 * linha "N% base iva líquido". Achado real (validação manual, 2
 * documentos reais independentes): `RATE_AND_AMOUNT`, ao encontrar
 * "IVA" dentro do próprio cabeçalho da tabela ("...Valor IVA
 * Líquido"), capturava o primeiro número a seguir à taxa — que é a
 * coluna "Valor" (base tributável), não "Valor IVA" (o imposto em si).
 * Resultado: o IVA extraído era sistematicamente o valor errado (ex.
 * "76,83" em vez do real "3,07").
 *
 * Não ancorado ao texto exato do cabeçalho ("Taxa"/"Valor"/"Líquido")
 * — achado real: o OCR devolveu-o de formas diferentes em cada
 * documento ("axa Valor Valor IVA Líquido", "Taxã valor Valor IVA
 * Liquído") e uma nova variante apareceria certamente num próximo
 * fornecedor. Em vez disso, ancorado só à palavra-chave "IVA" (já
 * exigida pelos outros padrões) seguida, numa janela curta, por uma
 * linha com a assinatura estrutural desta tabela — taxa% e depois
 * exatamente 3 valores monetários (base, IVA, líquido) — independente
 * de como o cabeçalho em si foi lido. O 2º valor é sempre o IVA:
 * ordem de colunas fixa por lei em faturas portuguesas, não uma
 * convenção por fornecedor.
 */
const TAX_BREAKDOWN_ROW =
  /\b(?:iva|vat)\b[\s\S]{0,80}?\n\s*(\d{1,2}(?:[.,]\d)?)\s*%\s+\d+[.,]\d{2}\s+(\d+[.,]\d{2})\s+\d+[.,]\d{2}\b/i;

/**
 * Extrai a linha de IVA/VAT — taxa e/ou montante. Tenta primeiro a
 * tabela de discriminação (mais específica e inequívoca quando
 * presente); só depois "taxa + montante" (ex. "IVA (23%): 12,34€"),
 * depois só taxa, depois só montante — a primeira que corresponder
 * define o resultado.
 */
@Injectable()
export class VatExtractor implements FiscalExtractor<VatExtraction> {
  readonly field = FiscalField.VAT;

  async extract(ocrText: string): Promise<ExtractionMatch<VatExtraction> | null> {
    const table = ocrText.match(TAX_BREAKDOWN_ROW);
    if (table) {
      const rate = parseAmount(table[1]);
      const amount = parseAmount(table[2]);
      if (rate !== null && amount !== null) {
        return { value: { rate, amount }, confidence: 90, source: table[0].trim() };
      }
    }

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
