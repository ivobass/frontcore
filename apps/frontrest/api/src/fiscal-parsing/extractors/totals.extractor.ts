import { Injectable } from '@nestjs/common';
import type { FiscalExtractor } from '../contracts';
import type { ExplainsRejection, RejectionExplanation } from '../contracts';
import type { ExtractionMatch, TotalsExtraction } from '../types';
import { FiscalField } from '../types';
import { parseAmount, tolerantWord } from '../utils';

// \b antes de `TOTAL_WORD` impede que "Subtotal" seja lido como "Total"
// (não há fronteira de palavra entre "Sub" e a palavra seguinte).
// `TOTAL_WORD` tolera a confusão de OCR do "T" maiúsculo inicial com
// "l"/"I"/"1"/"r" — achado real (3 documentos independentes): "lotal
// (Furos)", "rotal (Euros)". Construído via `tolerantWord` (camada
// genérica reutilizável, Fase 6.8+) — o "T" maiúsculo em 'Total' marca
// a letra com evidência de confusão; o resto fica literal.
const TOTAL_WORD = tolerantWord('Total');

// Rótulos específicos/inequívocos — têm sempre prioridade sobre o
// "Total" genérico, ambíguo entre subtotal/total final. "fatura"
// inclui a variante "factura" — achado real ("JMV": "Total Factura").
const SPECIFIC_LABEL = new RegExp(
  `(?:${TOTAL_WORD}\\s*a\\s*pagar|valor\\s*a\\s*pagar|valor\\s*${TOTAL_WORD}|${TOTAL_WORD}\\s*geral|` +
    `import[âa]ncia\\s*(?:liquidada|${TOTAL_WORD})|${TOTAL_WORD}\\s*(?:da\\s*)?(?:fatura|factura)|` +
    `grand\\s*${TOTAL_WORD}|amount\\s*due)`,
  'gi',
);
const GENERIC_LABEL = new RegExp(`\\b${TOTAL_WORD}\\b`, 'gi');

/**
 * Só conta como "montante" um token com separador decimal + exatamente
 * 2 dígitos finais (com ou sem milhares antes) — nunca um inteiro solto
 * (código de entidade, NIF, quantidade). Achado real ("Ovos Girão"): o
 * total "4377,00€" reportado pelo utilizador era na verdade o código
 * "Entidade" (4377) de uma linha de tabela — um inteiro sem separador
 * decimal nenhum, que a expressão antiga aceitava por ter "formato
 * monetário" (dígitos só). Esta exigência elimina essa classe inteira
 * de falso positivo — nunca por serem "improváveis", mas por não
 * termos sequer um separador decimal presente.
 */
// `(?!\d)` no final (não `\b`) — achado real (regressão, "Farmácia
// Monumental" sintética, Fase 6.8+ estabilização): `\b` falha quando o
// código da moeda vem colado a seguir ao valor sem separador
// ("35,40EUR") porque dígito→letra não é fronteira de palavra (ambos
// são carateres de "palavra" em regex); `(?!\d)` exprime a intenção
// real da guarda — só rejeitar se vierem MAIS dígitos a seguir (o que
// indicaria que os 2 decimais capturados estão incompletos), nunca
// letras (código de moeda) ou símbolos.
const DECIMAL_AMOUNT = /\d{1,3}(?:[.,]\d{3})*[.,]\d{2}(?!\d)/g;

/** Montante logo a seguir ao rótulo — só pontuação/espaço/parêntese de moeda entre eles, símbolo opcional antes do valor. */
const TIGHT_ADJACENT_AMOUNT =
  /^(?:\s*\([^)]{0,15}\))?\s*[:.\-]?\s*[€$£]?\s?(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})(?!\d)/;

/** O resto da linha do rótulo é "vazio" (só espaço/parêntese de moeda/traços de tabela) — sinal de que o valor está numa linha seguinte, nunca de que qualquer texto ali serve. */
const EMPTYISH_REST_OF_LINE = /^(?:\s*\([^)]{0,15}\))?[\s|]*$/;

const MAX_LOOKAHEAD_LINES = 4;

function isZero(amount: string): boolean {
  const normalized = amount.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.');
  return parseFloat(normalized) === 0;
}

interface AmountCandidate {
  amount: string;
  label: string;
  index: number;
}

/**
 * Resolve o montante associado a UMA ocorrência do rótulo — três casos,
 * por ordem, todos com evidência real:
 *
 * 1. **Montante logo a seguir, mesma linha** (`TIGHT_ADJACENT_AMOUNT`)
 *    — o caso comum ("Total a Pagar: 45,90€"). Usa-se sempre que
 *    existir, nunca se avança para os casos seguintes.
 * 2. **Nada a seguir ao rótulo, resto da linha vazio** — achado real
 *    ("JMV": "Total Factura" sozinho numa linha de cabeçalho de
 *    tabela; "Ovos Girão": "Total (EUR)" no fim de uma linha de
 *    cabeçalho). Só neste caso se procura nas linhas seguintes
 *    (`MAX_LOOKAHEAD_LINES`), ficando com o ÚLTIMO montante decimal
 *    válido da primeira linha que tiver algum — a linha de dados
 *    alinhada com esse cabeçalho.
 * 3. **Outro texto entre o rótulo e qualquer valor** — achado real
 *    ("Dismade": "Total 5 NA" era um cabeçalho de coluna de tabela de
 *    produtos, não do total do documento; "Total do IVA: 4,60€" não é
 *    o total da fatura). Esta ocorrência é descartada por completo —
 *    nunca avança para as linhas seguintes, que pertenceriam a uma
 *    linha de produto ou secção não relacionada.
 */
function resolveAmountForLabel(text: string, labelEndIndex: number): string | null {
  const rest = text.slice(labelEndIndex);
  const lines = rest.split('\n');
  const restOfLine = lines[0];

  const tight = TIGHT_ADJACENT_AMOUNT.exec(restOfLine);
  if (tight) {
    return isZero(tight[1]) ? null : tight[1];
  }

  if (!EMPTYISH_REST_OF_LINE.test(restOfLine)) {
    return null;
  }

  for (let i = 1; i < Math.min(lines.length, MAX_LOOKAHEAD_LINES); i++) {
    const matches = [...lines[i].matchAll(DECIMAL_AMOUNT)].map((m) => m[0]);
    const nonZero = matches.filter((amount) => !isZero(amount));
    if (nonZero.length > 0) {
      return nonZero[nonZero.length - 1];
    }
    if (matches.length > 0) {
      // Só zeros nesta linha — não é a linha de dados certa; para em
      // vez de avançar para uma linha ainda mais distante e menos
      // relacionada com o rótulo.
      return null;
    }
  }
  return null;
}

/**
 * Entre várias ocorrências do mesmo rótulo, resolve cada uma
 * independentemente e escolhe entre os resultados válidos:
 * - **Rótulo específico**: fica com o ÚLTIMO que resolveu (o total
 *   final costuma vir depois de qualquer subtotal/discriminação).
 * - **Rótulo genérico** (`\bTotal\b` sozinho): se restarem candidatos
 *   com valores DIFERENTES entre si, é ambíguo — achado real
 *   ("Coca-Cola": vários "Total X" independentes — produtos, IEC,
 *   taras — cada um com o seu próprio valor, sem nenhum claramente "o"
 *   total do documento). Preferir null a adivinhar entre eles.
 */
function findBestAmount(
  text: string,
  labelPattern: RegExp,
  rejectAmbiguous: boolean,
): { amount: string; label: string } | { ambiguous: true } | null {
  labelPattern.lastIndex = 0;
  const positions = [...text.matchAll(labelPattern)];
  const found: AmountCandidate[] = [];
  for (const m of positions) {
    const amount = resolveAmountForLabel(text, m.index + m[0].length);
    if (amount) {
      found.push({ amount, label: m[0], index: m.index });
    }
  }
  if (found.length === 0) {
    return null;
  }
  const distinctAmounts = new Set(found.map((f) => f.amount));
  if (rejectAmbiguous && distinctAmounts.size > 1) {
    return { ambiguous: true };
  }
  const best = found[found.length - 1];
  return { amount: best.amount, label: best.label };
}

/** Extrai o total final da fatura (ex. "Total a Pagar: 45,90€", "Total Factura ... 106,58"). */
@Injectable()
export class TotalsExtractor implements FiscalExtractor<TotalsExtraction>, ExplainsRejection {
  readonly field = FiscalField.TOTALS;

  async extract(ocrText: string): Promise<ExtractionMatch<TotalsExtraction> | null> {
    const specific = findBestAmount(ocrText, SPECIFIC_LABEL, false);
    const isSpecific = specific !== null && !('ambiguous' in specific);
    const resolved = isSpecific ? specific : findBestAmount(ocrText, GENERIC_LABEL, true);
    if (!resolved || 'ambiguous' in resolved) {
      return null;
    }
    const totalAmount = parseAmount(resolved.amount);
    if (totalAmount === null) {
      return null;
    }
    // Rótulo específico é um sinal mais forte do que o "Total"
    // genérico, ambíguo entre subtotal/total final — mesma lógica de
    // níveis de confiança usada em `SupplierExtractor`.
    const confidence = isSpecific ? 85 : 60;
    return { value: { totalAmount }, confidence, source: `${resolved.label} … ${resolved.amount}` };
  }

  /** Só explica quando existiu ambiguidade real entre candidatos genéricos — nunca para "não encontrei nada". */
  explainRejection(ocrText: string): RejectionExplanation | null {
    const specific = findBestAmount(ocrText, SPECIFIC_LABEL, false);
    if (specific && !('ambiguous' in specific)) {
      return null; // extract() teria aceitado isto — nada a explicar
    }
    GENERIC_LABEL.lastIndex = 0;
    const positions = [...ocrText.matchAll(GENERIC_LABEL)];
    const found: AmountCandidate[] = [];
    for (const m of positions) {
      const amount = resolveAmountForLabel(ocrText, m.index + m[0].length);
      if (amount) {
        found.push({ amount, label: m[0], index: m.index });
      }
    }
    const distinctAmounts = [...new Set(found.map((f) => f.amount))];
    if (distinctAmounts.length > 1) {
      return {
        candidate: distinctAmounts.join(', '),
        reason: `${distinctAmounts.length} valores candidatos sem rótulo inequívoco a desambiguar entre eles`,
      };
    }
    return null;
  }
}
