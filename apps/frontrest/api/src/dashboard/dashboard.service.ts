import { Injectable } from '@nestjs/common';
import { PrismaService, Prisma, InvoiceStatus } from '@frontcore/database';
import type { FinancialSummaryQueryDto } from './dto/financial-summary-query.dto';
import { resolvePeriod } from './period.util';

/** Quantos fornecedores aparecem em `topSuppliers` — pequeno e explícito, sem paginação (Fase 7). */
const TOP_SUPPLIERS_LIMIT = 5;

const SEM_CATEGORIA = 'Sem categoria';

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

const ZERO = new Prisma.Decimal(0);

/** `Decimal` → string, nunca via `number` — evita a perda de precisão de uma conversão prematura (Fase 7). */
function decimalToString(value: Prisma.Decimal | number | null | undefined): string {
  return (value ? new Prisma.Decimal(value) : ZERO).toFixed(2);
}

/**
 * Agregações do dashboard financeiro (Fase 7) — só `Invoice`, nunca
 * `InvoiceDraft` (esse continua staging, nunca dado financeiro
 * confirmado). `CANCELLED` fica fora de todos os totais "ativos", mas
 * continua contado à parte (`cancelledInvoiceCount`) e presente em
 * `byStatus` — nunca escondido, só não somado aos totais principais.
 * Nenhuma query depende do número de faturas (sem N+1): um pedido fixo
 * por secção do contrato, sempre com `organizationId` no `where`.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getFinancialSummary(
    organizationId: string,
    query: FinancialSummaryQueryDto,
  ): Promise<FinancialDashboardSummary> {
    const period = resolvePeriod(query.from, query.to);

    const baseWhere: Prisma.InvoiceWhereInput = {
      organizationId,
      issueDate: { gte: period.gte, lt: period.lt },
    };
    const activeWhere: Prisma.InvoiceWhereInput = { ...baseWhere, status: { not: InvoiceStatus.CANCELLED } };

    const [activeAgg, cancelledInvoiceCount, byStatusRaw, activeInvoicesForTrend, byCategoryRaw, topSuppliersRaw] =
      await Promise.all([
        this.prisma.invoice.aggregate({
          where: activeWhere,
          _count: true,
          _sum: { totalAmount: true },
          _avg: { totalAmount: true },
        }),
        this.prisma.invoice.count({ where: { ...baseWhere, status: InvoiceStatus.CANCELLED } }),
        this.prisma.invoice.groupBy({
          by: ['status'],
          where: baseWhere,
          _count: true,
          _sum: { totalAmount: true },
        }),
        // Só para a tendência mensal — Prisma não tem `date_trunc` portável
        // nativo; agregar em memória sobre um único SELECT já filtrado por
        // organização+período (nunca N+1, nunca a listagem paginada) é
        // proporcional ao volume esperado por organização (ver análise da
        // fase). `Prisma.$queryRaw` com `date_trunc` foi considerado e
        // descartado — menos portável, sem necessidade concreta de
        // performance demonstrada.
        this.prisma.invoice.findMany({
          where: activeWhere,
          select: { issueDate: true, totalAmount: true },
        }),
        this.prisma.invoice.groupBy({
          by: ['categoryId'],
          where: activeWhere,
          _count: true,
          _sum: { totalAmount: true },
        }),
        this.prisma.invoice.groupBy({
          by: ['supplierId'],
          where: activeWhere,
          _count: true,
          _sum: { totalAmount: true },
          orderBy: { _sum: { totalAmount: 'desc' } },
          take: TOP_SUPPLIERS_LIMIT,
        }),
      ]);

    const [categories, suppliers] = await Promise.all([
      this.lookupCategoryNames(organizationId, byCategoryRaw),
      this.lookupSupplierNames(organizationId, topSuppliersRaw),
    ]);

    const activeInvoiceCount = activeAgg._count;

    return {
      period: { from: period.from, to: period.to },
      totals: {
        invoiceCount: activeInvoiceCount,
        activeInvoiceCount,
        cancelledInvoiceCount,
        totalAmount: decimalToString(activeAgg._sum.totalAmount),
        averageAmount: decimalToString(activeAgg._avg.totalAmount),
      },
      byStatus: byStatusRaw.map((row) => ({
        status: row.status,
        count: row._count,
        totalAmount: decimalToString(row._sum.totalAmount),
      })),
      monthlyTrend: this.buildMonthlyTrend(activeInvoicesForTrend),
      byCategory: byCategoryRaw.map((row) => ({
        categoryId: row.categoryId,
        categoryName: row.categoryId ? (categories.get(row.categoryId) ?? SEM_CATEGORIA) : SEM_CATEGORIA,
        count: row._count,
        totalAmount: decimalToString(row._sum.totalAmount),
      })),
      topSuppliers: topSuppliersRaw.map((row) => ({
        supplierId: row.supplierId,
        supplierName: suppliers.get(row.supplierId) ?? row.supplierId,
        count: row._count,
        totalAmount: decimalToString(row._sum.totalAmount),
      })),
    };
  }

  private async lookupCategoryNames(
    organizationId: string,
    byCategoryRaw: Array<{ categoryId: string | null }>,
  ): Promise<Map<string, string>> {
    const ids = byCategoryRaw.map((row) => row.categoryId).filter((id): id is string => id !== null);
    if (ids.length === 0) return new Map();
    const categories = await this.prisma.expenseCategory.findMany({
      where: { id: { in: ids }, organizationId },
      select: { id: true, name: true },
    });
    return new Map(categories.map((c) => [c.id, c.name]));
  }

  private async lookupSupplierNames(
    organizationId: string,
    topSuppliersRaw: Array<{ supplierId: string }>,
  ): Promise<Map<string, string>> {
    const ids = topSuppliersRaw.map((row) => row.supplierId);
    if (ids.length === 0) return new Map();
    const suppliers = await this.prisma.supplier.findMany({
      where: { id: { in: ids }, organizationId },
      select: { id: true, name: true },
    });
    return new Map(suppliers.map((s) => [s.id, s.name]));
  }

  /** Agrega por `YYYY-MM` (a partir de `issueDate`, sempre lido em UTC) — soma via `Prisma.Decimal`, nunca `number`, para nunca perder precisão monetária. */
  private buildMonthlyTrend(
    invoices: Array<{ issueDate: Date; totalAmount: Prisma.Decimal }>,
  ): Array<{ month: string; count: number; totalAmount: string }> {
    const byMonth = new Map<string, { count: number; total: Prisma.Decimal }>();
    for (const invoice of invoices) {
      const month = invoice.issueDate.toISOString().slice(0, 7);
      const existing = byMonth.get(month) ?? { count: 0, total: ZERO };
      byMonth.set(month, {
        count: existing.count + 1,
        total: existing.total.plus(invoice.totalAmount),
      });
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, { count, total }]) => ({ month, count, totalAmount: total.toFixed(2) }));
  }
}
