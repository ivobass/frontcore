import { API_URL, authHeaders, buildQuery, parseJsonOrThrow } from './api';

/** Espelha `InvoiceStatus` de `@frontcore/database` (package backend-only) — mesmo padrão já usado em `lib/invoices.ts`. */
export type InvoiceStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export interface FinancialSummaryParams {
  /** ISO `YYYY-MM-DD`, opcional — omitido usa o mês atual (decisão do backend). */
  from?: string;
  /** ISO `YYYY-MM-DD`, opcional. */
  to?: string;
}

/**
 * Forma HTTP de `GET /dashboard/financial-summary` (Fase 7) — montantes
 * como strings (serialização segura de `Decimal`, nunca convertidos
 * para `number` pelo frontend); `period.from`/`period.to` continuam em
 * ISO `YYYY-MM-DD` — a conversão para `pt-PT` é sempre responsabilidade
 * da apresentação (`lib/format.ts::formatDate`), nunca deste cliente.
 */
export interface FinancialDashboardSummary {
  period: { from: string; to: string };
  totals: {
    invoiceCount: number;
    activeInvoiceCount: number;
    cancelledInvoiceCount: number;
    totalAmount: string;
    averageAmount: string;
  };
  byStatus: Array<{ status: InvoiceStatus; count: number; totalAmount: string }>;
  monthlyTrend: Array<{ month: string; count: number; totalAmount: string }>;
  byCategory: Array<{ categoryId: string | null; categoryName: string; count: number; totalAmount: string }>;
  topSuppliers: Array<{ supplierId: string; supplierName: string; count: number; totalAmount: string }>;
}

export async function getFinancialSummary(
  accessToken: string,
  params: FinancialSummaryParams = {},
): Promise<FinancialDashboardSummary> {
  const response = await fetch(`${API_URL}/dashboard/financial-summary${buildQuery(params)}`, {
    headers: authHeaders(accessToken),
  });
  return parseJsonOrThrow(response);
}

/**
 * Forma HTTP de `GET /dashboard/financial-insights` (Fase 8.9) — KPIs
 * derivados, contrato separado de `FinancialDashboardSummary`, nunca
 * fundido com ele. `share`/`percentageChange` (incl. `TrendInsight.
 * comparison.percentageChange`, correção pós-revisão) são sempre string
 * decimal normalizada a 2 casas (`"33.33"`, `"-8.20"`), nunca `number` —
 * o símbolo "%" é responsabilidade só da apresentação.
 */
export interface SupplierInsight {
  supplierId: string;
  supplierName: string;
  count: number;
  totalAmount: string;
  share: string | null;
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
  count: number;
  totalAmount: string;
}

export interface LargestExpenseInvoice {
  id: string;
  supplierName: string;
  categoryName: string;
  issueDate: string;
  status: InvoiceStatus;
  totalAmount: string;
}

export interface LargestExpenseInsight {
  invoice: LargestExpenseInvoice | null;
}

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
  /** `null` com menos de 2 meses com dados, ou quando os dois meses mais recentes não são consecutivos (correção pós-revisão). */
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
  supplierRanking: SupplierInsight[];
  categoryRanking: CategoryInsight[];
}

export async function getFinancialInsights(
  accessToken: string,
  params: FinancialSummaryParams = {},
): Promise<FinancialInsights> {
  const response = await fetch(`${API_URL}/dashboard/financial-insights${buildQuery(params)}`, {
    headers: authHeaders(accessToken),
  });
  return parseJsonOrThrow(response);
}
