import { Injectable } from '@nestjs/common';
import { PrismaService, Prisma } from '@frontcore/database';
import type { InvoiceStatus } from '@frontcore/database';
import { DashboardService } from '../dashboard/dashboard.service';
import type { FinancialDashboardSummary } from '../dashboard/dashboard.service';
import { compareAmount, compareCount } from '../dashboard/period-comparison.util';
import type { PeriodComparisonValue } from '../dashboard/period-comparison.util';
import { resolveMonth, previousMonth } from './month.util';

export type { PeriodComparisonValue } from '../dashboard/period-comparison.util';

const SEM_CATEGORIA = 'Sem categoria';

export interface MonthlyReportPeriod {
  month: string;
  from: string;
  to: string;
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
  totals: FinancialDashboardSummary['totals'];
  comparison: {
    totalAmount: PeriodComparisonValue;
    activeInvoiceCount: PeriodComparisonValue;
  };
  byStatus: FinancialDashboardSummary['byStatus'];
  byCategory: FinancialDashboardSummary['byCategory'];
  topSuppliers: FinancialDashboardSummary['topSuppliers'];
  invoices: MonthlyReportInvoiceDetail[];
}

/**
 * Relatório financeiro mensal (Fase 9) — reutiliza exclusivamente a API
 * pública de `DashboardService` (`getFinancialSummary()` +
 * `FinancialDashboardSummary`) para todas as agregações; nunca conhece
 * os seus métodos privados nem reimplementa nenhuma query de agregação
 * financeira. A única query Prisma própria deste serviço é o detalhe de
 * faturas do mês (`invoices[]`), que `DashboardService` não expõe.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly prisma: PrismaService,
  ) {}

  async getMonthlyReport(organizationId: string, month: string): Promise<MonthlyFinancialReport> {
    const period = resolveMonth(month);
    const previous = resolveMonth(previousMonth(month));

    const [summary, previousSummary, invoices] = await Promise.all([
      this.dashboardService.getFinancialSummary(organizationId, { from: period.from, to: period.to }),
      this.dashboardService.getFinancialSummary(organizationId, { from: previous.from, to: previous.to }),
      this.fetchInvoiceDetails(organizationId, period.gte, period.lt),
    ]);

    return {
      period: { month: period.month, from: period.from, to: period.to },
      previousPeriod: { month: previous.month, from: previous.from, to: previous.to },
      totals: summary.totals,
      comparison: {
        totalAmount: compareAmount(summary.totals.totalAmount, previousSummary.totals.totalAmount),
        activeInvoiceCount: compareCount(
          summary.totals.activeInvoiceCount,
          previousSummary.totals.activeInvoiceCount,
        ),
      },
      byStatus: summary.byStatus,
      byCategory: summary.byCategory,
      topSuppliers: summary.topSuppliers,
      invoices,
    };
  }

  /**
   * Detalhe de faturas do mês — inclui `CANCELLED` (são documentos reais
   * do período, distinguíveis pelo campo `status`), mesma decisão já
   * documentada na análise da fase. Sem paginação: o volume é
   * naturalmente limitado por organização+mês.
   */
  private async fetchInvoiceDetails(
    organizationId: string,
    gte: Date,
    lt: Date,
  ): Promise<MonthlyReportInvoiceDetail[]> {
    const invoices = await this.prisma.invoice.findMany({
      where: { organizationId, issueDate: { gte, lt } },
      orderBy: { issueDate: 'asc' },
      select: {
        id: true,
        number: true,
        issueDate: true,
        dueDate: true,
        status: true,
        totalAmount: true,
        supplier: { select: { name: true } },
        category: { select: { name: true } },
      },
    });

    return invoices.map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      supplierName: invoice.supplier.name,
      categoryName: invoice.category?.name ?? SEM_CATEGORIA,
      issueDate: invoice.issueDate.toISOString().slice(0, 10),
      dueDate: invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : null,
      status: invoice.status,
      totalAmount: new Prisma.Decimal(invoice.totalAmount).toFixed(2),
    }));
  }
}
