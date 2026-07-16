import { Injectable } from '@nestjs/common';
import { PrismaService, Prisma } from '@frontcore/database';
import type { InvoiceStatus } from '@frontcore/database';
import { DashboardService } from '../dashboard/dashboard.service';
import type { FinancialDashboardSummary } from '../dashboard/dashboard.service';
import { resolveMonth, previousMonth } from './month.util';

const SEM_CATEGORIA = 'Sem categoria';

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
        totalAmount: this.compareAmount(summary.totals.totalAmount, previousSummary.totals.totalAmount),
        activeInvoiceCount: this.compareCount(
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

  private compareAmount(current: string, previous: string): PeriodComparisonValue {
    const currentDecimal = new Prisma.Decimal(current);
    const previousDecimal = new Prisma.Decimal(previous);
    const absoluteChange = currentDecimal.minus(previousDecimal);
    return {
      current: currentDecimal.toFixed(2),
      previous: previousDecimal.toFixed(2),
      absoluteChange: absoluteChange.toFixed(2),
      percentageChange: previousDecimal.isZero()
        ? null
        : Number(absoluteChange.dividedBy(previousDecimal.abs()).times(100).toFixed(2)),
      direction: absoluteChange.isZero() ? 'unchanged' : absoluteChange.isPositive() ? 'increase' : 'decrease',
    };
  }

  private compareCount(current: number, previous: number): PeriodComparisonValue {
    const absoluteChange = current - previous;
    return {
      current: String(current),
      previous: String(previous),
      absoluteChange: String(absoluteChange),
      percentageChange:
        previous === 0 ? null : Number((((current - previous) / Math.abs(previous)) * 100).toFixed(2)),
      direction: absoluteChange === 0 ? 'unchanged' : absoluteChange > 0 ? 'increase' : 'decrease',
    };
  }
}
