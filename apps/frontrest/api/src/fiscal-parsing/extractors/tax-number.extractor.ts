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
// devolveu literalmente "NTF" em vez de "NIF" (confusão I↔T).
// "contribuinte" — achado real (validação manual, Fase 6.12, "Ilha
// Pan"/"Ovos Girão"): o NIF do fornecedor aparece por vezes só rotulado
// "Contribuinte Nº"/"Contribuinte N.º:", nunca "NIF"/"NIPC".
//
// Separador entre o rótulo e o valor: até 10 carateres não-dígito
// (nunca `\n`), não só `[:.\-]` — achado real ("Ovos Girão"): "Contribuinte
// N.º: 511022220" tem "N.º" (ordinal) entre o rótulo e o valor, que um
// separador de pontuação simples não cobre. Preguiçoso (`{0,10}?`), não
// guloso — achado real ("VAT Number: PT123456789"): um separador guloso
// consome o prefixo de país ("PT") antes de o grupo de captura ter
// oportunidade de o apanhar, perdendo-o do valor final.
//
// A captura aceita letras confundíveis com dígitos (`DIGIT_LIKE_CLASS`/
// `normalizeOcrDigits`) no corpo do número, não só dígitos — ex. um NIF
// real lido como "5O9978142". Nunca inventa um dígito a partir de nada:
// só troca um caráter já presente, e o resultado é validado antes de
// ser aceite (`isValidTaxId`) — se a normalização não produzir um
// número válido, o candidato é descartado em vez de arriscar um NIF
// errado.
const TAX_ID_LABEL = new RegExp(
  `\\b(?:nif|ntf|nipc|contribuinte|vat\\s*(?:number|no\\.?|id)?|tax\\s*id)\\b[^\\d\\n]{0,10}?` +
    `([A-Z]{0,2}\\s?${DIGIT_LIKE_CLASS}{9,12})\\b`,
  'gi',
);

/**
 * Dígito de controlo do NIF português (módulo 11) — achado real (Fase
 * 6.12): confirmado empiricamente contra 8 NIFs reais já validados
 * nesta base de código (Pingo Doce, JMV, Ovos Girão, Dismade, Farmácia
 * Esperança/Monumental) — todos passam; o NIF `511004949`, o NIF do
 * CLIENTE indevidamente apanhado no documento real "Ilha Pan" em vez
 * do NIF do fornecedor (`511132557`), **falha** este teste —
 * confirmação independente de que o candidato errado também é
 * estruturalmente inválido, não só "pertence ao cliente errado": não é
 * preciso nenhuma deteção de secção do cliente para o descartar, o
 * próprio número já não é um NIF válido. Só se aplica a NIF de 9
 * dígitos (Portugal); VAT de outros países (10-12 dígitos) não tem
 * este algoritmo, aceite só pela forma.
 */
function hasValidPortugueseCheckDigit(nif9: string): boolean {
  const digits = nif9.split('').map(Number);
  const sum = digits.slice(0, 8).reduce((acc, d, i) => acc + d * (9 - i), 0);
  const remainder = sum % 11;
  const expected = remainder < 2 ? 0 : 11 - remainder;
  return digits[8] === expected;
}

function isValidTaxId(digits: string): boolean {
  if (!/^\d{9,12}$/.test(digits)) return false;
  return digits.length === 9 ? hasValidPortugueseCheckDigit(digits) : true;
}

interface TaxIdCandidate {
  value: string;
  source: string;
  index: number;
}

/** Resolve UMA ocorrência do rótulo para um candidato válido, ou `null` se a normalização/checksum a rejeitar. */
function resolveCandidate(rawMatch: string, capture: string, index: number): TaxIdCandidate | null {
  const raw = capture.replace(/\s+/g, '');
  const [, prefix, body] = /^([A-Z]{0,2})(.*)$/i.exec(raw) ?? [];
  const digits = normalizeOcrDigits(body ?? raw);
  if (!isValidTaxId(digits)) return null;
  return { value: `${(prefix ?? '').toUpperCase()}${digits}`, source: rawMatch.trim(), index };
}

/**
 * Melhor candidato a NIF — nunca "a primeira ocorrência no documento,
 * ponto final" (era assim antes da Fase 6.12: `.match()`, só a 1ª
 * ocorrência, sem sequer validar o checksum). Considera TODAS as
 * ocorrências (`matchAll`) e descarta as que não passam `isValidTaxId`
 * antes de escolher — entre as sobreviventes, vence a primeira no
 * documento.
 *
 * Deliberadamente NÃO tenta distinguir NIF do fornecedor de NIF do
 * cliente por proximidade a marcadores de secção do cliente (ex.
 * "CLIENTE"/"EXMO") — avaliado e descartado nesta fase: essa mesma
 * palavra aparece, nestes documentos reais, em pelo menos três
 * contextos que não são a secção de identidade do cliente (linha de
 * assinatura "Recebi... O Cliente:", texto legal genérico "à
 * disposição do cliente", e uma linha do próprio fornecedor fundida
 * pelo OCR com o início de uma saudação ao cliente) — tentar
 * distingui-los duplicou o número de falsos positivos em vez de os
 * reduzir. Ver "Limitações conhecidas" no documento da Fase 6.12.
 */
function bestTaxIdCandidate(ocrText: string): TaxIdCandidate | null {
  const candidates: TaxIdCandidate[] = [];
  for (const m of ocrText.matchAll(TAX_ID_LABEL)) {
    const resolved = resolveCandidate(m[0], m[1], m.index ?? 0);
    if (resolved) candidates.push(resolved);
  }
  candidates.sort((a, b) => a.index - b.index);
  return candidates[0] ?? null;
}

/** Extrai o número de identificação fiscal (NIF/VAT) — o primeiro candidato estruturalmente válido (checksum incluído), não necessariamente do fornecedor quando o documento também rotular o NIF do cliente (ver limitação conhecida). */
@Injectable()
export class TaxNumberExtractor implements FiscalExtractor<string> {
  readonly field = FiscalField.SUPPLIER_TAX_ID;

  async extract(ocrText: string): Promise<ExtractionMatch<string> | null> {
    const candidate = bestTaxIdCandidate(ocrText);
    return candidate ? { value: candidate.value, confidence: 90, source: candidate.source } : null;
  }
}
