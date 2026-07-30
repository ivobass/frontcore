import type { FinancialInsights, TrendComparison } from '../../financial-insights/financial-insights.types';
import type { FinancialAnalysis, FinancialAnalysisResult } from '../contracts';

export type MonthlyTrendConclusion = 'increase' | 'decrease' | 'unchanged';

export type MonthlyTrendAnalysisResult = FinancialAnalysisResult<'monthly_trend', MonthlyTrendConclusion, TrendComparison>;

export type MonthlyTrendAnalysis = FinancialAnalysis<'monthly_trend', MonthlyTrendConclusion, TrendComparison>;

/**
 * Reutiliza exclusivamente `insights.trend.comparison` (Fase 8.9) —
 * nunca recalcula tendência, nunca acrescenta campos novos à evidência
 * (o próprio `TrendComparison`, sem wrapper). `null` quando `comparison`
 * é `null` (menos de 2 meses com dados no período, ou os 2 meses mais
 * recentes não são consecutivos) — por invariante já garantida por
 * `resolveTrend()` (`financial-insights.util.ts`), `direction` só é
 * `'insufficient_data'` exatamente quando `comparison` é `null`; a
 * guarda abaixo cobre ambos por clareza, e estreita o tipo de
 * `direction` para `MonthlyTrendConclusion` sem necessidade de cast.
 */
export const monthlyTrendAnalysis: MonthlyTrendAnalysis = {
  id: 'monthly_trend',
  analyze(insights: FinancialInsights): MonthlyTrendAnalysisResult | null {
    const { comparison, direction } = insights.trend;
    if (comparison === null || direction === 'insufficient_data') {
      return null;
    }
    return {
      id: 'monthly_trend',
      conclusion: direction,
      evidence: comparison,
    };
  },
};
