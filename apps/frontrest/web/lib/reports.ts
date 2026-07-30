import { API_URL, ApiError, authHeaders, buildQuery, parseJsonOrThrow } from './api';
import type { FinancialInsights, FinancialAnalysisEngineOutput } from './dashboard';

export type InvoiceStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export interface MonthlyReportPeriod {
  month: string;
  from: string;
  to: string;
}

export interface PeriodComparisonValue {
  current: string;
  previous: string;
  absoluteChange: string;
  percentageChange: number | null;
  direction: 'increase' | 'decrease' | 'unchanged';
}

export interface MonthlyReportInvoiceDetail {
  id: string;
  number: string | null;
  supplierName: string;
  categoryName: string;
  issueDate: string;
  dueDate: string | null;
  status: InvoiceStatus;
  totalAmount: string;
}

export interface MonthlyFinancialReport {
  period: MonthlyReportPeriod;
  previousPeriod: MonthlyReportPeriod;
  totals: {
    invoiceCount: number;
    activeInvoiceCount: number;
    cancelledInvoiceCount: number;
    totalAmount: string;
    averageAmount: string;
  };
  comparison: {
    totalAmount: PeriodComparisonValue;
    activeInvoiceCount: PeriodComparisonValue;
  };
  byStatus: Array<{ status: InvoiceStatus; count: number; totalAmount: string }>;
  byCategory: Array<{ categoryId: string | null; categoryName: string; count: number; totalAmount: string }>;
  topSuppliers: Array<{ supplierId: string; supplierName: string; count: number; totalAmount: string }>;
  invoices: MonthlyReportInvoiceDetail[];
  /**
   * Financial Insights (Fase 8.9) do mês selecionado — contrato
   * separado, nunca fundido com `totals`/`byStatus`/etc. Opcional
   * (correção pós-revisão): uma resposta antiga (deploy faseado,
   * resposta em cache anterior a esta fase) pode não incluir este
   * campo — a API em si nunca deixou de o devolver, o frontend é que
   * nunca deve assumir a sua presença.
   */
  insights?: FinancialInsights;
  /**
   * Financial Analysis Engine (Fase 8.10/8.12) sobre os mesmos
   * `insights` acima — contrato separado, nunca fundido. Sempre
   * presente (nunca opcional, ao contrário de `insights` acima): a API
   * nunca omite este campo, mesmo sem nenhuma conclusão aplicável
   * (`analysis.results: []`).
   */
  analysis: FinancialAnalysisEngineOutput;
}

export async function getMonthlyReport(accessToken: string, month: string): Promise<MonthlyFinancialReport> {
  const response = await fetch(`${API_URL}/reports/monthly${buildQuery({ month })}`, {
    headers: authHeaders(accessToken),
  });
  return parseJsonOrThrow(response);
}

function extractFilename(disposition: string | null): string | null {
  if (!disposition) return null;
  const match = /filename="([^"]+)"/.exec(disposition);
  return match?.[1] ?? null;
}

/**
 * Download autenticado de um ficheiro (CSV/PDF) — `parseJsonOrThrow`
 * (`lib/api.ts`) assume sempre JSON, por isso este helper é dedicado a
 * respostas binárias, sem alterar o helper existente. Nunca abre um URL
 * sem autenticação — o `fetch` inclui sempre o `Authorization`; o
 * `Blob` só existe em memória do browser, nunca um link direto ao
 * endpoint da API.
 */
async function downloadReportFile(accessToken: string, path: string, fallbackFilename: string): Promise<void> {
  const response = await fetch(`${API_URL}${path}`, { headers: authHeaders(accessToken) });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(data?.message ?? 'Não foi possível exportar o relatório.', response.status);
  }
  const blob = await response.blob();
  const filename = extractFilename(response.headers.get('Content-Disposition')) ?? fallbackFilename;

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export function downloadMonthlyReportCsv(accessToken: string, month: string): Promise<void> {
  return downloadReportFile(
    accessToken,
    `/reports/monthly.csv${buildQuery({ month })}`,
    `relatorio-financeiro-${month}.csv`,
  );
}

export function downloadMonthlyReportPdf(accessToken: string, month: string): Promise<void> {
  return downloadReportFile(
    accessToken,
    `/reports/monthly.pdf${buildQuery({ month })}`,
    `relatorio-financeiro-${month}.pdf`,
  );
}
