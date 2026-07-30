import { Prisma } from '@frontcore/database';
import type { FinancialDashboardSummary, LargestInvoice } from '../dashboard/dashboard.service';
import type {
  CategoryInsight,
  FinancialInsights,
  OutstandingInsight,
  SupplierInsight,
  TrendComparison,
  TrendInsight,
} from './financial-insights.types';

/** Fixadas nesta fase — sem configuração por ambiente nem parâmetro HTTP (YAGNI, Fase 8.9). */
export const FINANCIAL_INSIGHTS_SUPPLIER_TOP_N = 3;
export const FINANCIAL_INSIGHTS_CATEGORY_TOP_N = 3;

/** "Por pagar" = Pendente + Vencida — mesma definição já usada pelo Chat IA (Fase 8), agora única fonte. */
const OUTSTANDING_STATUSES = new Set<string>(['PENDING', 'OVERDUE']);

const ZERO = new Prisma.Decimal(0);

/**
 * % de `part` sobre `total`, sempre via `Prisma.Decimal` — nunca `number`
 * intermédio. `null` quando `total` é zero, nunca `Infinity`/`NaN`
 * calculado e depois validado (mesma disciplina de `compareAmount()`).
 * Formato canónico: string decimal com exatamente 2 casas (ex.
 * `"33.33"`) — o símbolo "%" é sempre responsabilidade da camada de
 * apresentação, nunca deste módulo.
 */
function percentageToString(part: Prisma.Decimal, total: Prisma.Decimal): string | null {
  if (total.isZero()) {
    return null;
  }
  return part.dividedBy(total).times(100).toFixed(2);
}

/**
 * Desempate estável (correção pós-revisão, Fase 8.9) — `topSuppliers`/
 * `byCategory` já vêm ordenados por valor desc de `DashboardService`
 * (Fase 8.4), mas o `groupBy`/`orderBy` do Prisma não garante uma ordem
 * determinística entre linhas com o mesmo `totalAmount` (a base de
 * dados pode devolvê-las em qualquer ordem entre execuções). Nunca
 * muta o array recebido (`[...rows]`, cópia) — o array original de
 * `FinancialDashboardSummary` continua exatamente como veio, para
 * qualquer outro consumidor que o leia diretamente (ex. `/dashboard`,
 * `/reports`). Critério: valor desc (primário, já quase sempre
 * verdade), nome asc (`localeCompare`, 2º desempate), `idOf` (3º
 * desempate, opcional — correção final da Fase 8.9: o modelo permite
 * fornecedores distintos com o mesmo nome; quando nome e montante são
 * também iguais, `idOf` garante ainda o mesmo resultado, sempre,
 * independente da ordem devolvida pela base de dados — nunca a posição
 * original do array). Omitido (categorias, comportamento inalterado
 * desta correção) o desempate para nesse 2º nível, exatamente como
 * antes.
 */
function sortDeterministically<T extends { totalAmount: string }>(
  rows: T[],
  nameOf: (row: T) => string,
  idOf?: (row: T) => string,
): T[] {
  return [...rows].sort((a, b) => {
    const byAmount = new Prisma.Decimal(b.totalAmount).comparedTo(new Prisma.Decimal(a.totalAmount));
    if (byAmount !== 0) return byAmount;
    const byName = nameOf(a).localeCompare(nameOf(b));
    if (byName !== 0) return byName;
    return idOf ? idOf(a).localeCompare(idOf(b)) : 0;
  });
}

export function buildSupplierRanking(
  topSuppliers: FinancialDashboardSummary['topSuppliers'],
  totalAmount: string,
): SupplierInsight[] {
  const total = new Prisma.Decimal(totalAmount);
  return sortDeterministically(topSuppliers, (row) => row.supplierName, (row) => row.supplierId).map((row, index) => ({
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    count: row.count,
    totalAmount: row.totalAmount,
    share: percentageToString(new Prisma.Decimal(row.totalAmount), total),
    rank: index + 1,
  }));
}

export function buildCategoryRanking(
  byCategory: FinancialDashboardSummary['byCategory'],
  totalAmount: string,
): CategoryInsight[] {
  const total = new Prisma.Decimal(totalAmount);
  return sortDeterministically(byCategory, (row) => row.categoryName).map((row, index) => ({
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    count: row.count,
    totalAmount: row.totalAmount,
    share: percentageToString(new Prisma.Decimal(row.totalAmount), total),
    rank: index + 1,
  }));
}

/**
 * Soma dos primeiros `topN` já ordenados por valor desc (`topSuppliers`/
 * `byCategory` já vêm assim de `DashboardService`, Fase 8.4, com
 * desempate estável aplicado acima) ÷ total do período. `topN`
 * devolvido é sempre a quantidade **efetivamente considerada**
 * (`min(topN pedido, elementos disponíveis)`, correção pós-revisão) —
 * nunca apresenta "top 3" quando só existem 1 ou 2 elementos reais.
 */
export function computeConcentration(
  ranking: Array<{ totalAmount: string }>,
  topN: number,
  totalAmount: string,
): { topN: number; share: string | null } {
  const total = new Prisma.Decimal(totalAmount);
  const effectiveTopN = Math.min(topN, ranking.length);
  const sum = ranking.slice(0, effectiveTopN).reduce((acc, row) => acc.plus(row.totalAmount), ZERO);
  return { topN: effectiveTopN, share: percentageToString(sum, total) };
}

/** Extraído de `FinancialRetrievalService.selectOutstanding()` (Fase 8.1) — mesma soma via `Decimal`, agora única fonte partilhada por Chat/Dashboard/Reports. */
export function resolveOutstanding(byStatus: FinancialDashboardSummary['byStatus']): OutstandingInsight {
  const rows = byStatus.filter((row) => OUTSTANDING_STATUSES.has(row.status));
  const count = rows.reduce((total, row) => total + row.count, 0);
  const totalAmount = rows.reduce((total, row) => total.plus(row.totalAmount), ZERO).toFixed(2);
  return { count, totalAmount };
}

/** A maior fatura já vem em 1º lugar (`getLargestInvoices()`, `orderBy: totalAmount desc`) — `null` quando não há nenhuma no período. */
export function resolveLargestExpense(largestInvoices: LargestInvoice[]): { invoice: LargestInvoice | null } {
  return { invoice: largestInvoices[0] ?? null };
}

/** `month` é sempre `YYYY-MM` (`DashboardService.buildMonthlyTrend()`) — índice absoluto de mês (ano×12 + mês 0-based), para comparar consecutividade sem depender de string parsing frágil. */
function monthIndex(month: string): number {
  const [year, monthNumber] = month.split('-').map(Number);
  return year * 12 + (monthNumber - 1);
}

/** Verdadeiro só quando `latest` é exatamente o mês seguinte a `previous` — cobre a viragem de ano (ex. "2026-12" → "2027-01") por construção, sem caso especial. */
function areConsecutiveMonths(previous: string, latest: string): boolean {
  return monthIndex(latest) - monthIndex(previous) === 1;
}

/**
 * Comparação de tendência (correção pós-revisão, Fase 8.9) — sempre via
 * `Prisma.Decimal`, nunca `number` intermédio; `percentageChange` é
 * sempre string decimal a 2 casas ou `null` (nunca `number` — contrato
 * próprio `TrendComparison`, nunca `PeriodComparisonValue`, cujo
 * `percentageChange: number` permanece inalterado para PERIOD_COMPARISON/
 * Reports).
 */
function buildTrendComparison(currentAmount: string, previousAmount: string): TrendComparison {
  const current = new Prisma.Decimal(currentAmount);
  const previous = new Prisma.Decimal(previousAmount);
  const absoluteChange = current.minus(previous);
  return {
    current: current.toFixed(2),
    previous: previous.toFixed(2),
    absoluteChange: absoluteChange.toFixed(2),
    percentageChange: previous.isZero() ? null : absoluteChange.dividedBy(previous.abs()).times(100).toFixed(2),
    direction: absoluteChange.isZero() ? 'unchanged' : absoluteChange.isPositive() ? 'increase' : 'decrease',
  };
}

/**
 * Direção mês a mês a partir dos dois últimos pontos de `monthlyTrend`
 * (já ordenado ascendente por `DashboardService.buildMonthlyTrend()`).
 * Correção pós-revisão: só produz uma tendência real quando esses dois
 * meses são **consecutivos** (`areConsecutiveMonths()`) — com menos de
 * 2 meses com dados, ou com uma lacuna temporal entre eles (ex. maio →
 * julho, sem junho), devolve sempre `insufficient_data` explícito,
 * nunca uma tendência fabricada a partir de pontos não adjacentes.
 */
export function resolveTrend(monthlyTrend: FinancialDashboardSummary['monthlyTrend']): TrendInsight {
  if (monthlyTrend.length < 2) {
    return {
      latestMonth: monthlyTrend[0]?.month ?? null,
      previousMonth: null,
      comparison: null,
      direction: 'insufficient_data',
    };
  }
  const previous = monthlyTrend[monthlyTrend.length - 2];
  const latest = monthlyTrend[monthlyTrend.length - 1];
  if (!areConsecutiveMonths(previous.month, latest.month)) {
    return {
      latestMonth: latest.month,
      previousMonth: null,
      comparison: null,
      direction: 'insufficient_data',
    };
  }
  const comparison = buildTrendComparison(latest.totalAmount, previous.totalAmount);
  return {
    latestMonth: latest.month,
    previousMonth: previous.month,
    comparison,
    direction: comparison.direction,
  };
}

/**
 * Ponto de entrada único (Fase 8.9) — deriva `FinancialInsights` a
 * partir de dados já obtidos por quem chama (`DashboardService.
 * getFinancialSummary()`/`getLargestInvoices()`, sempre as APIs
 * públicas) — nunca acede ao Prisma, nunca chama outro método de
 * `DashboardService`, nunca recalcula uma agregação já feita. Reutilizada
 * sem alteração por `FinancialRetrievalService` (Chat), `DashboardController`
 * e `ReportsService` — única fonte dos KPIs derivados.
 */
export function buildFinancialInsights(
  summary: FinancialDashboardSummary,
  largestInvoices: LargestInvoice[],
): FinancialInsights {
  const supplierRanking = buildSupplierRanking(summary.topSuppliers, summary.totals.totalAmount);
  const categoryRanking = buildCategoryRanking(summary.byCategory, summary.totals.totalAmount);

  return {
    period: summary.period,
    largestSupplier: supplierRanking[0] ?? null,
    largestCategory: categoryRanking[0] ?? null,
    supplierConcentration: computeConcentration(supplierRanking, FINANCIAL_INSIGHTS_SUPPLIER_TOP_N, summary.totals.totalAmount),
    categoryConcentration: computeConcentration(categoryRanking, FINANCIAL_INSIGHTS_CATEGORY_TOP_N, summary.totals.totalAmount),
    outstanding: resolveOutstanding(summary.byStatus),
    largestExpense: resolveLargestExpense(largestInvoices),
    trend: resolveTrend(summary.monthlyTrend),
    supplierRanking,
    categoryRanking,
  };
}
