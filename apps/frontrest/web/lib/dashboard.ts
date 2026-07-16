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
