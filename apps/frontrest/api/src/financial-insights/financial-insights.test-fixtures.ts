import type { FinancialInsights } from './financial-insights.types';

/**
 * Fixture mínima e neutra (Fase 8.9) para testes que constroem um
 * `FinancialIntentData` de `FINANCIAL_SUMMARY` mas não avaliam Financial
 * Insights diretamente — todos os campos "vazios" (nulls, zeros,
 * `insufficient_data`), nunca valores inventados. Reutilizada por vários
 * ficheiros de teste (`ai-chat.service.spec.ts`,
 * `financial-context.builder.spec.ts`,
 * `financial-conversation-context.spec.ts`,
 * `financial-grounding.validator.spec.ts`,
 * `ai-tool-orchestrator.service.spec.ts`) — nunca uma cópia duplicada.
 */
export function buildEmptyFinancialInsights(period: { from: string; to: string }): FinancialInsights {
  return {
    period,
    largestSupplier: null,
    largestCategory: null,
    supplierConcentration: { topN: 3, share: null },
    categoryConcentration: { topN: 3, share: null },
    outstanding: { count: 0, totalAmount: '0.00' },
    largestExpense: { invoice: null },
    trend: { latestMonth: null, previousMonth: null, comparison: null, direction: 'insufficient_data' },
    supplierRanking: [],
    categoryRanking: [],
  };
}
