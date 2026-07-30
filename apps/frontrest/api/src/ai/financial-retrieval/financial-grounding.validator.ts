import { Prisma } from '@frontcore/database';
import type { FinancialIntentData, FinancialRetrievalResult } from './financial-retrieval.service';
import type { FinancialInsights } from '../../financial-insights/financial-insights.types';
import { sanitizeDomainText, translateStatus } from './financial-context.builder';

/**
 * Marcadores partilhados (Fase 8.8) para uma mensagem `ASSISTANT`
 * construída a partir de `buildFinancialContextMessage()` porque a
 * resposta real do provider falhou `validateFinancialGrounding()` —
 * usados tanto pelo caminho direto (`AiChatService`) como pelo caminho
 * de tool calling (`AiToolOrchestratorService`), única fonte de
 * verdade, nunca duas cópias divergentes. `provider` reutiliza o mesmo
 * valor `'deterministic'` do fallback "sem dados" (Fase 8.3) — ambos
 * significam "nunca confiado ao texto do LLM"; `model` é distinto
 * (`GROUNDING_FALLBACK_MODEL` vs. o `model` do fallback sem dados),
 * para uma auditoria conseguir distinguir a razão.
 */
export const GROUNDING_FALLBACK_PROVIDER = 'deterministic';
export const GROUNDING_FALLBACK_MODEL = 'financial-grounding-fallback';

export type FinancialGroundingFailureReason =
  | 'AMOUNT_NOT_ALLOWED'
  | 'COUNT_NOT_ALLOWED'
  | 'DATE_NOT_ALLOWED'
  | 'PERCENTAGE_NOT_ALLOWED'
  | 'MISSING_REQUIRED_STATUS'
  | 'MISSING_REQUIRED_SUPPLIER'
  | 'MISSING_REQUIRED_CATEGORY';

export type FinancialGroundingResult =
  | { grounded: true }
  | { grounded: false; reason: FinancialGroundingFailureReason };

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

// Valor monetário seguido de "€"/"EUR" — cobre pt-PT com separador de
// milhares "." ou espaço e decimal ",", o formato interno (ponto
// decimal, usado pelos dados estruturados), sinal negativo, e
// combinações dos dois (ex. "12.345.678,90 EUR"). Grupos de milhares
// exigem sempre exatamente 3 dígitos (`\d{3}`); o grupo decimal final,
// só 1-2 (nunca 3) — é esta diferença de comprimento que desambigua
// estruturalmente um separador de milhares de um separador decimal,
// sem precisar de adivinhar a partir do símbolo usado (nem "." nem ","
// têm um único significado fixo). `\d+` (sem limite superior) na parte
// inteira — nunca `\d{1,3}` — para um número sem nenhum separador de
// milhares (ex. "12345,67") nunca ser cortado a meio.
const AMOUNT_TOKEN_PATTERN = /(-?\d+(?:[ .,]\d{3})*(?:[.,]\d{1,2})?)\s*(?:€|eur\b)/gi;
// Contagem de faturas — só um número imediatamente antes de "fatura(s)".
const COUNT_TOKEN_PATTERN = /(\d+)\s*fatura(?:s)?\b/gi;
// Só datas em formato ISO (YYYY-MM-DD) — uma data em português corrido
// ("12 de julho de 2026") nunca é extraída nem validada aqui (ver
// "Limitações conhecidas" em `docs/phases/phase-8.8-*.md`).
const ISO_DATE_TOKEN_PATTERN = /\b\d{4}-\d{2}-\d{2}\b/g;
// Percentagem (Fase 8.9, Financial Insights) — sinal negativo opcional
// (ex. "-15%", tendência em queda), vírgula ou ponto decimal, 1-2 casas
// decimais. Normalizada sempre para o formato canónico (`toFixed(2)`,
// via Decimal) antes de comparar — nunca tolerância aproximada.
const PERCENTAGE_TOKEN_PATTERN = /(-?\d+(?:[.,]\d{1,2})?)\s*%/g;

// Separador decimal final: sempre o ÚLTIMO "."/"," do número, seguido
// só de 1-2 dígitos até ao fim — nunca 3 (esses são sempre milhares,
// nunca decimais, nesta análise). `(.*)`` guloso (nunca `.*?`) para
// encontrar sempre o separador mais à direita que satisfaça esta forma
// — replica exatamente a mesma desambiguação estrutural já feita pelo
// próprio `AMOUNT_TOKEN_PATTERN` ao capturar o token.
const TRAILING_DECIMAL_PATTERN = /^(.*)[.,](\d{1,2})$/;

/**
 * `"354,00"`/`"354.00"`/`"1.234,56"`/`"1 234,56"`/`"12.345.678,90"`/
 * `"-1.234,56"` → sempre `"354.00"`/`"1234.56"`/`"-1234.56"` — mesmo
 * formato exato dos valores em `FinancialRetrievalResult`
 * (`Prisma.Decimal.toFixed(2)`, ponto decimal, sempre 2 casas, sinal só
 * quando negativo). Sinal preservado sempre à parte, nunca perdido na
 * normalização.
 */
function normalizeAmountToken(rawToken: string): string {
  const isNegative = rawToken.startsWith('-');
  const unsigned = isNegative ? rawToken.slice(1) : rawToken;

  const decimalMatch = unsigned.match(TRAILING_DECIMAL_PATTERN);
  const integerPart = decimalMatch ? decimalMatch[1] : unsigned;
  const fractionPart = decimalMatch ? decimalMatch[2] : '';

  // Remove separadores de milhares (".", "," ou espaço) — o que sobra é sempre só dígitos.
  const cleanedInteger = integerPart.replace(/[.,\s]/g, '');
  const paddedFraction = fractionPart.padEnd(2, '0').slice(0, 2);
  const sign = isNegative ? '-' : '';
  return `${sign}${cleanedInteger}.${paddedFraction}`;
}

/**
 * Normaliza uma percentagem apresentada em texto para o formato canónico
 * (Fase 8.9) — sempre via `Prisma.Decimal`, nunca `number` intermédio,
 * para nunca introduzir um erro de arredondamento na própria comparação.
 * `"60"`/`"60,00"`/`"60.00"` → sempre `"60.00"`; sinal preservado
 * (tendência em queda, ex. `"-15%"` → `"-15.00"`).
 */
function normalizePercentageToken(rawToken: string): string {
  return new Prisma.Decimal(rawToken.replace(',', '.')).toFixed(2);
}

interface AllowedFacts {
  amounts: Set<string>;
  counts: Set<number>;
  dates: Set<string>;
  /** Fase 8.9 — percentagens dos Financial Insights, sempre já normalizadas ao formato canónico (2 casas, `Decimal`). */
  percentages: Set<string>;
}

/** Tipo estrutural mínimo (`current`/`previous`/`absoluteChange`, sempre string) — aceita `PeriodComparisonValue` (Fase 9) e `TrendComparison` (Fase 8.9), nunca precisa de `percentageChange`/`direction` aqui. */
function addComparisonAmounts(amounts: Set<string>, value: { current: string; previous: string; absoluteChange: string }): void {
  amounts.add(value.current);
  amounts.add(value.previous);
  amounts.add(value.absoluteChange);
}

/**
 * Regista todos os factos autorizados presentes num `FinancialInsights`
 * (Fase 8.9) — montantes/contagens/datas/percentagens, sempre lidos do
 * contrato tipado, nunca recalculados aqui. `share`/`percentageChange`
 * nulos (total zero, ou tendência com `insufficient_data`) nunca são
 * adicionados — nenhuma percentagem "null" pode aparecer em texto.
 */
function collectInsightFacts(
  insights: FinancialInsights,
  amounts: Set<string>,
  counts: Set<number>,
  dates: Set<string>,
  percentages: Set<string>,
): void {
  for (const row of [insights.largestSupplier, insights.largestCategory]) {
    if (!row) continue;
    amounts.add(row.totalAmount);
    counts.add(row.count);
    if (row.share !== null) {
      percentages.add(row.share);
    }
  }
  if (insights.supplierConcentration.share !== null) {
    percentages.add(insights.supplierConcentration.share);
  }
  if (insights.categoryConcentration.share !== null) {
    percentages.add(insights.categoryConcentration.share);
  }
  amounts.add(insights.outstanding.totalAmount);
  counts.add(insights.outstanding.count);
  if (insights.largestExpense.invoice) {
    amounts.add(insights.largestExpense.invoice.totalAmount);
    dates.add(insights.largestExpense.invoice.issueDate);
  }
  if (insights.trend.comparison) {
    addComparisonAmounts(amounts, insights.trend.comparison);
    // `TrendComparison.percentageChange` já é string canónica (Fase 8.9,
    // correção pós-revisão) — nunca `number`, por isso nunca precisa de
    // passar por `Prisma.Decimal` aqui, ao contrário do PERIOD_COMPARISON abaixo.
    if (insights.trend.comparison.percentageChange !== null) {
      percentages.add(insights.trend.comparison.percentageChange);
    }
  }
}

/**
 * Extrai o conjunto fechado de factos "permitidos" diretamente do
 * `FinancialRetrievalResult` já resolvido — nunca reanalisa texto,
 * nunca chama o LLM. Cobre todas as variantes de `FinancialIntentData`
 * (Fases 8.1–8.6); qualquer valor/contagem/data que apareça na resposta
 * final e não esteja neste conjunto é, por definição, um valor que os
 * dados estruturados desta fase nunca continham.
 */
function collectAllowedFacts(result: Extract<FinancialRetrievalResult, { kind: 'DATA' }>): AllowedFacts {
  const amounts = new Set<string>();
  const counts = new Set<number>();
  const dates = new Set<string>([result.period.from, result.period.to]);
  const percentages = new Set<string>();

  const data: FinancialIntentData = result.data;
  switch (data.intent) {
    case 'FINANCIAL_SUMMARY': {
      // `data.analysis` (Fase 8.10/8.13, Financial Analysis Engine) nunca
      // precisa de uma coleta própria aqui: por desenho, a evidência de
      // `monthlyTrendAnalysis`/`relativeConcentrationAnalysis` é sempre uma
      // cópia verbatim de campos já presentes em `insights` (`trend.
      // comparison`, `supplierConcentration.share`, `categoryConcentration.
      // share`) — `collectInsightFacts()`, abaixo, já autoriza qualquer
      // valor/percentagem que `analysis` possa introduzir. Reavaliar (YAGNI)
      // apenas se uma análise futura produzir evidência que não seja um
      // subconjunto de `insights`.
      const { totals, insights } = data;
      amounts.add(totals.totalAmount);
      amounts.add(totals.averageAmount);
      counts.add(totals.invoiceCount);
      counts.add(totals.activeInvoiceCount);
      counts.add(totals.cancelledInvoiceCount);
      collectInsightFacts(insights, amounts, counts, dates, percentages);
      break;
    }
    case 'OUTSTANDING_BALANCE': {
      amounts.add(data.outstandingAmount);
      counts.add(data.outstandingCount);
      break;
    }
    case 'BY_STATUS': {
      for (const row of data.byStatus) {
        amounts.add(row.totalAmount);
        counts.add(row.count);
      }
      break;
    }
    case 'BY_CATEGORY': {
      for (const row of data.byCategory) {
        amounts.add(row.totalAmount);
        counts.add(row.count);
      }
      break;
    }
    case 'TOP_SUPPLIERS': {
      for (const row of data.topSuppliers) {
        amounts.add(row.totalAmount);
        counts.add(row.count);
      }
      break;
    }
    case 'MONTHLY_TREND': {
      for (const row of data.monthlyTrend) {
        amounts.add(row.totalAmount);
        counts.add(row.count);
      }
      break;
    }
    case 'LARGEST_INVOICES': {
      for (const invoice of data.invoices) {
        amounts.add(invoice.totalAmount);
        dates.add(invoice.issueDate);
      }
      break;
    }
    case 'PERIOD_COMPARISON': {
      const { current, previous, comparison } = data;
      for (const totals of [current.totals, previous.totals]) {
        amounts.add(totals.totalAmount);
        amounts.add(totals.averageAmount);
        counts.add(totals.invoiceCount);
        counts.add(totals.activeInvoiceCount);
        counts.add(totals.cancelledInvoiceCount);
      }
      dates.add(current.period.from);
      dates.add(current.period.to);
      dates.add(previous.period.from);
      dates.add(previous.period.to);
      addComparisonAmounts(amounts, comparison.totalAmount);
      // `comparison.activeInvoiceCount` é uma contagem representada como
      // string (`PeriodComparisonValue`), nunca um valor em EUR — fora do
      // conjunto `amounts` de propósito, nunca validada aqui.
      // Correção pós-revisão (Fase 8.9): as duas percentagens reais desta
      // comparação (`percentageChange`, sempre `number` aqui —
      // `PeriodComparisonValue`, Fase 9, nunca alterado) tinham ficado de
      // fora do conjunto permitido — qualquer resposta que mencionasse a
      // percentagem real (ex. "100%") era incorretamente rejeitada assim
      // que a Fase 8.9 passou a validar percentagens em texto.
      for (const value of [comparison.totalAmount.percentageChange, comparison.activeInvoiceCount.percentageChange]) {
        if (value !== null) {
          percentages.add(new Prisma.Decimal(value).toFixed(2));
        }
      }
      break;
    }
  }

  return { amounts, counts, dates, percentages };
}

/**
 * Fronteira determinística (Fase 8.8, Strict Grounding) entre o
 * `FinancialRetrievalResult` real e a resposta final de texto livre do
 * provider — nunca usa o LLM para validar o próprio LLM. Falha
 * (`grounded: false`) quando a resposta contém:
 *
 * - um valor monetário (`€`/`EUR`) que não é nenhum dos valores reais
 *   dos dados estruturados (`AMOUNT_NOT_ALLOWED`);
 * - uma contagem de faturas (`N fatura(s)`) que não é nenhuma das
 *   contagens reais (`COUNT_NOT_ALLOWED`);
 * - uma data ISO (`YYYY-MM-DD`) que não é nenhuma das datas reais —
 *   período consultado, período de comparação, ou data de fatura em
 *   `LARGEST_INVOICES` (`DATE_NOT_ALLOWED`);
 * - uma percentagem (`N%`, Fase 8.9 — Financial Insights) que não
 *   corresponde a nenhum `share`/`percentageChange` real, depois de
 *   normalizada ao formato canónico (vírgula ou ponto decimal
 *   aceites na entrada, comparação sempre exata, sem tolerâncias
 *   aproximadas nem arredondamentos diferentes do valor autorizado)
 *   (`PERCENTAGE_NOT_ALLOWED`);
 * - quando `result.filters.status`/`supplierName`/`categoryName` está
 *   definido (a pergunta é sobre uma entidade/estado nomeado
 *   específico), e a resposta não menciona sequer esse nome/estado
 *   real — sinal de substituição (o nome/estado real foi trocado por
 *   outro, nunca omitido sem razão) (`MISSING_REQUIRED_STATUS`/
 *   `MISSING_REQUIRED_SUPPLIER`/`MISSING_REQUIRED_CATEGORY`).
 *
 * Nunca valida (por desenho, documentado como limitação): números por
 * extenso, datas em português corrido, nomes de fornecedor/categoria
 * mencionados sem filtro explícito (ex. numa lista de "principais
 * fornecedores" sem `filters.supplierName`), ou qualquer alegação
 * puramente qualitativa sem número/data/nome associado.
 */
export function validateFinancialGrounding(
  content: string,
  result: Extract<FinancialRetrievalResult, { kind: 'DATA' }>,
): FinancialGroundingResult {
  const { amounts, counts, dates, percentages } = collectAllowedFacts(result);

  for (const match of content.matchAll(AMOUNT_TOKEN_PATTERN)) {
    if (!amounts.has(normalizeAmountToken(match[1]))) {
      return { grounded: false, reason: 'AMOUNT_NOT_ALLOWED' };
    }
  }

  for (const match of content.matchAll(COUNT_TOKEN_PATTERN)) {
    if (!counts.has(Number(match[1]))) {
      return { grounded: false, reason: 'COUNT_NOT_ALLOWED' };
    }
  }

  for (const match of content.matchAll(ISO_DATE_TOKEN_PATTERN)) {
    if (!dates.has(match[0])) {
      return { grounded: false, reason: 'DATE_NOT_ALLOWED' };
    }
  }

  for (const match of content.matchAll(PERCENTAGE_TOKEN_PATTERN)) {
    if (!percentages.has(normalizePercentageToken(match[1]))) {
      return { grounded: false, reason: 'PERCENTAGE_NOT_ALLOWED' };
    }
  }

  const normalizedContent = normalize(content);
  const { filters } = result;
  if (filters.status && !normalizedContent.includes(normalize(translateStatus(filters.status)))) {
    return { grounded: false, reason: 'MISSING_REQUIRED_STATUS' };
  }
  if (filters.supplierName && !normalizedContent.includes(normalize(sanitizeDomainText(filters.supplierName)))) {
    return { grounded: false, reason: 'MISSING_REQUIRED_SUPPLIER' };
  }
  if (filters.categoryName && !normalizedContent.includes(normalize(sanitizeDomainText(filters.categoryName)))) {
    return { grounded: false, reason: 'MISSING_REQUIRED_CATEGORY' };
  }

  return { grounded: true };
}
