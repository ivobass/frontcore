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

/**
 * Forma HTTP de `GET /dashboard/financial-analysis` (Fase 8.11) —
 * conclusões determinísticas do Financial Analysis Engine (Fase 8.10)
 * sobre os mesmos `insights` desta resposta; `id`/`conclusion` são
 * discriminadores estáveis (nunca traduzidos pelo backend) — a
 * tradução para pt-PT é sempre responsabilidade da apresentação.
 */
export type MonthlyTrendConclusion = 'increase' | 'decrease' | 'unchanged';

export interface MonthlyTrendAnalysisResult {
  id: 'monthly_trend';
  conclusion: MonthlyTrendConclusion;
  evidence: TrendComparison;
}

export type RelativeConcentrationConclusion =
  | 'supplier_more_concentrated'
  | 'category_more_concentrated'
  | 'equally_concentrated';

export interface RelativeConcentrationEvidence {
  supplierShare: string;
  supplierTopN: number;
  categoryShare: string;
  categoryTopN: number;
}

export interface RelativeConcentrationAnalysisResult {
  id: 'relative_concentration';
  conclusion: RelativeConcentrationConclusion;
  evidence: RelativeConcentrationEvidence;
}

export type FinancialAnalysisOutcome = MonthlyTrendAnalysisResult | RelativeConcentrationAnalysisResult;

export interface FinancialAnalysisMetadata {
  analysesRun: string[];
  conclusionsProduced: number;
}

export interface FinancialAnalysisEngineOutput {
  results: FinancialAnalysisOutcome[];
  metadata: FinancialAnalysisMetadata;
}

export interface DashboardFinancialAnalysisResponse {
  insights: FinancialInsights;
  analysis: FinancialAnalysisEngineOutput;
}

export async function getDashboardFinancialAnalysis(
  accessToken: string,
  params: FinancialSummaryParams = {},
): Promise<DashboardFinancialAnalysisResponse> {
  const response = await fetch(`${API_URL}/dashboard/financial-analysis${buildQuery(params)}`, {
    headers: authHeaders(accessToken),
  });
  return parseJsonOrThrow(response);
}
