import type { LargestInvoice } from '../dashboard/dashboard.service';

/**
 * KPIs derivados (Fase 8.9) — contrato deliberadamente separado de
 * `FinancialDashboardSummary` ("FinancialSummary"), nunca fundido nem
 * substituído por ele. `FinancialDashboardSummary` representa agregados;
 * `FinancialInsights` representa conclusões determinísticas calculadas
 * a partir desses agregados (nunca uma query própria — ver
 * `financial-insights.util.ts`). `share`/`percentageChange` novos deste
 * módulo são sempre string decimal normalizada a 2 casas (ex. "33.33"),
 * nunca `number` — o símbolo "%" só é acrescentado na camada de
 * apresentação (texto do Chat, serializers, frontend), nunca aqui.
 */

export interface SupplierInsight {
  supplierId: string;
  supplierName: string;
  count: number;
  totalAmount: string;
  /** % do total do período ao qual este fornecedor pertence; `null` quando esse total é zero — nunca `Infinity`/`NaN`. */
  share: string | null;
  /** 1-based — 1 é o fornecedor de maior valor. */
  rank: number;
}

export interface CategoryInsight {
  categoryId: string | null;
  categoryName: string;
  count: number;
  totalAmount: string;
  share: string | null;
  rank: number;
}

export interface OutstandingInsight {
  /** Pendente + Vencida — sempre presente, mesmo a zero, nunca omitido. */
  count: number;
  totalAmount: string;
}

export interface LargestExpenseInsight {
  /** `null` quando não há nenhuma fatura no período — nunca uma fatura fabricada. */
  invoice: LargestInvoice | null;
}

/**
 * Comparação de tendência (correção pós-revisão, Fase 8.9) — contrato
 * próprio dos Financial Insights, nunca `PeriodComparisonValue`
 * (Fase 9, contrato original preservado sem alteração, `percentageChange:
 * number`). Aqui `percentageChange` é sempre string decimal normalizada
 * a 2 casas (`"12.34"`, `"-8.20"`) ou `null` — nunca `number`, mesma
 * disciplina de `share` em `SupplierInsight`/`CategoryInsight`.
 */
export interface TrendComparison {
  current: string;
  previous: string;
  absoluteChange: string;
  percentageChange: string | null;
  direction: 'increase' | 'decrease' | 'unchanged';
}

export interface TrendInsight {
  latestMonth: string | null;
  previousMonth: string | null;
  /**
   * `null` com menos de 2 meses com dados no período, **ou** quando os
   * dois meses mais recentes não são consecutivos (ex. maio → julho,
   * com junho em falta) — nunca uma tendência fabricada a partir de
   * pontos não adjacentes nem de um único ponto.
   */
  comparison: TrendComparison | null;
  direction: 'increase' | 'decrease' | 'unchanged' | 'insufficient_data';
}

export interface FinancialInsights {
  period: { from: string; to: string };
  largestSupplier: SupplierInsight | null;
  largestCategory: CategoryInsight | null;
  supplierConcentration: { topN: number; share: string | null };
  categoryConcentration: { topN: number; share: string | null };
  outstanding: OutstandingInsight;
  largestExpense: LargestExpenseInsight;
  trend: TrendInsight;
  /** Enriquece `topSuppliers`/`byCategory` já existentes (mesma janela — top 5 fornecedores, todas as categorias) — nunca os substitui nem altera o contrato de `FinancialDashboardSummary`. */
  supplierRanking: SupplierInsight[];
  categoryRanking: CategoryInsight[];
}
