import type { AiToolDefinition } from '@frontcore/ai';
import type { FinancialIntentType } from '../financial-retrieval/financial-intent.resolver';

const PERIOD_PARAMETER = {
  type: 'object' as const,
  properties: {
    period: {
      type: 'string',
      description:
        'Período em português, linguagem natural — ex.: "este mês", "mês passado", "junho de 2026", "este ano", "ano passado".',
    },
  },
  required: ['period'],
};

/**
 * Tools read-only (Fase 8.3) — cada uma espelha 1:1 uma das 6 intenções
 * já suportadas pelo retrieval determinístico (Fase 8.1), reutilizando
 * exatamente a mesma fonte de dados (`FinancialRetrievalService.retrieveForIntent()`
 * → `DashboardService`). Nunca uma tool por pergunta concreta — sempre
 * orientadas por domínio, nunca escrita, nunca `organizationId`/`userId`
 * como parâmetro (vêm sempre do chamador autenticado, nunca do modelo).
 */
export const FINANCIAL_TOOL_DEFINITIONS: AiToolDefinition[] = [
  {
    name: 'get_financial_summary',
    description: 'Obtém o resumo financeiro (faturas ativas, total, média, faturas canceladas) de um período.',
    parameters: PERIOD_PARAMETER,
  },
  {
    name: 'get_outstanding_balance',
    description: 'Obtém o valor total e o número de faturas por pagar (Pendente + Vencida) de um período.',
    parameters: PERIOD_PARAMETER,
  },
  {
    name: 'get_invoices_by_status',
    description: 'Obtém a contagem e o total de faturas agrupados por estado (Pendente, Paga, Vencida, Cancelada) de um período.',
    parameters: PERIOD_PARAMETER,
  },
  {
    name: 'get_expenses_by_category',
    description: 'Obtém a contagem e o total de despesas agrupados por categoria de um período.',
    parameters: PERIOD_PARAMETER,
  },
  {
    name: 'get_top_suppliers',
    description: 'Obtém os principais fornecedores por valor total de um período.',
    parameters: PERIOD_PARAMETER,
  },
  {
    name: 'get_monthly_trend',
    description: 'Obtém a evolução mensal do total de faturas de um período.',
    parameters: PERIOD_PARAMETER,
  },
];

/** Allow-list fechada — um nome de tool fora deste mapa nunca é executado, mesmo que o modelo o invente. */
export const TOOL_NAME_TO_INTENT: Readonly<Record<string, FinancialIntentType>> = {
  get_financial_summary: 'FINANCIAL_SUMMARY',
  get_outstanding_balance: 'OUTSTANDING_BALANCE',
  get_invoices_by_status: 'BY_STATUS',
  get_expenses_by_category: 'BY_CATEGORY',
  get_top_suppliers: 'TOP_SUPPLIERS',
  get_monthly_trend: 'MONTHLY_TREND',
};
