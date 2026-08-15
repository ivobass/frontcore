import { Injectable } from '@nestjs/common';
import { PrismaService, Prisma, InvoiceStatus } from '@frontcore/database';
import type { FinancialSummaryQueryDto } from './dto/financial-summary-query.dto';
import { resolvePeriod } from './period.util';
import { buildFinancialInsights } from '../financial-insights/financial-insights.util';
import type { FinancialInsights } from '../financial-insights/financial-insights.types';
import { monthlyTrendAnalysis } from '../financial-analysis/analyses/monthly-trend.analysis';
import { relativeConcentrationAnalysis } from '../financial-analysis/analyses/relative-concentration.analysis';
import { runFinancialAnalyses } from '../financial-analysis/financial-analysis.engine';
import type { FinancialAnalysisEngineOutput } from '../financial-analysis/types';

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

/**
 * Uma fatura individual, para "maiores despesas" por fatura (Fase 8.4)
 * — nunca confundível com os agregados de `topSuppliers`/`byCategory`.
 * `number` (hardening pós-validação manual) — o número/identificador da
 * fatura (`Invoice.number`, sempre opcional ao nível do schema);
 * ausente até esta correção de todo o Financial Retrieval, apesar de já
 * existir na `Invoice` — o Chat IA nunca conseguia responder "qual é o
 * número da fatura?" mesmo quando a consulta resolvia inequivocamente
 * uma única fatura.
 */
export interface LargestInvoice {
  id: string;
  number: string | null;
  supplierName: string;
  categoryName: string;
  issueDate: string;
  status: InvoiceStatus;
  totalAmount: string;
}

/**
 * Forma de `GET /dashboard/financial-analysis` (Fase 8.11) — `insights`
 * são os factos (Fase 8.9, `FinancialInsights`, inalterado), `analysis`
 * são as conclusões determinísticas do motor (Fase 8.10,
 * `FinancialAnalysisEngineOutput`); os dois contratos permanecem
 * separados dentro desta resposta, nunca fundidos num terceiro.
 */
export interface DashboardFinancialAnalysisResponse {
  insights: FinancialInsights;
  analysis: FinancialAnalysisEngineOutput;
}

/** Análises registadas nesta fundação (Fase 8.10) — seleção explícita, nunca todas as que existirem no módulo. */
const REGISTERED_FINANCIAL_ANALYSES = [monthlyTrendAnalysis, relativeConcentrationAnalysis];

/** Quantas faturas aparecem em `getLargestInvoices()` por omissão — pequeno e explícito, sem paginação (mesma disciplina de `TOP_SUPPLIERS_LIMIT`). */
const LARGEST_INVOICES_LIMIT = 5;

const ZERO = new Prisma.Decimal(0);

/** `Decimal` → string, nunca via `number` — evita a perda de precisão de uma conversão prematura (Fase 7). */
function decimalToString(value: Prisma.Decimal | number | null | undefined): string {
  return (value ? new Prisma.Decimal(value) : ZERO).toFixed(2);
}

/**
 * Filtros financeiros fechados (Fase 8.4) — conjunto pequeno e
 * necessário para o Chat IA combinar dimensões (estado, fornecedor,
 * categoria), nunca uma DSL de query genérica. Todos opcionais e
 * aditivos: omissos, o comportamento é idêntico ao anterior a esta
 * fase (confirmado pelos testes de regressão de `/dashboard` e da Fase
 * 9). Quando `status` é indicado, substitui a exclusão por omissão de
 * `CANCELLED` (permite consultar exatamente esse estado, incluindo
 * `CANCELLED` explicitamente); `supplierId`/`categoryId` são sempre um
 * `AND` adicional ao filtro de período+organização.
 */
export interface FinancialSummaryFilters {
  status?: InvoiceStatus;
  supplierId?: string;
  categoryId?: string;
}

/**
 * Agregações do dashboard financeiro (Fase 7, filtros fechados na Fase
 * 8.4) — só `Invoice`, nunca `InvoiceDraft` (esse continua staging,
 * nunca dado financeiro confirmado). `CANCELLED` fica fora de todos os
 * totais "ativos" por omissão, mas continua contado à parte
 * (`cancelledInvoiceCount`) e presente em `byStatus` — nunca escondido,
 * só não somado aos totais principais quando nenhum `status` é pedido
 * explicitamente. Nenhuma query depende do número de faturas (sem
 * N+1): um pedido fixo por secção do contrato, sempre com
 * `organizationId` no `where`.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getFinancialSummary(
    organizationId: string,
    query: FinancialSummaryQueryDto & FinancialSummaryFilters,
  ): Promise<FinancialDashboardSummary> {
    const period = resolvePeriod(query.from, query.to);

    const baseWhere: Prisma.InvoiceWhereInput = {
      organizationId,
      issueDate: { gte: period.gte, lt: period.lt },
    };
    // Sem `status` explícito: comportamento idêntico ao anterior a esta
    // fase (exclui CANCELLED dos totais "ativos"). Com `status`
    // explícito: substitui essa exclusão — permite consultar exatamente
    // o estado pedido, incluindo CANCELLED.
    const statusWhere: Prisma.InvoiceWhereInput = query.status
      ? { status: query.status }
      : { status: { not: InvoiceStatus.CANCELLED } };
    const entityWhere: Prisma.InvoiceWhereInput = {
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    };
    const activeWhere: Prisma.InvoiceWhereInput = { ...baseWhere, ...statusWhere, ...entityWhere };
    // Hardening pós-validação manual — achado real: `byStatus` ignorava
    // sempre `query.status`, mesmo quando explicitamente pedido (nunca
    // aplicado a `activeAgg`/`activeInvoicesForTrend`), devolvendo a
    // repartição por TODOS os estados do período inteiro em vez de só o
    // estado pedido. `resolveOutstanding(byStatus)` (Fase 8.9,
    // `financial-insights.util.ts`) então combinava esse universo
    // completo (nunca filtrado) com `totals`/`largestInvoices`
    // corretamente filtrados por `activeWhere` — produzindo valores
    // matematicamente inconsistentes (ex. "por pagar" superior ao total
    // já filtrado, "pago" negativo) sempre que o Chat IA aplicava um
    // filtro de estado. Sem `query.status` explícito: comportamento
    // inalterado (continua a incluir `CANCELLED` como linha própria,
    // nunca escondida — Dashboard/Reports nunca passam `status`, só o
    // Chat IA o faz). Com `query.status` explícito: `byStatus` passa a
    // devolver só essa linha, o mesmo universo de `activeWhere`.
    const byStatusWhere: Prisma.InvoiceWhereInput = query.status
      ? activeWhere
      : { ...baseWhere, ...entityWhere };

    const [activeAgg, cancelledInvoiceCount, byStatusRaw, activeInvoicesForTrend, byCategoryRaw, topSuppliersRaw] =
      await Promise.all([
        this.prisma.invoice.aggregate({
          where: activeWhere,
          _count: true,
          _sum: { totalAmount: true },
          _avg: { totalAmount: true },
        }),
        this.prisma.invoice.count({
          where: { ...baseWhere, ...entityWhere, status: InvoiceStatus.CANCELLED },
        }),
        this.prisma.invoice.groupBy({
          by: ['status'],
          where: byStatusWhere,
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
          orderBy: { _sum: { totalAmount: 'desc' } },
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

  /**
   * Faturas individuais de maior valor (Fase 8.4) — estrutura de query
   * diferente das restantes secções (`findMany`/`orderBy totalAmount`,
   * nunca `groupBy`): "maiores despesas" quando a pergunta se refere a
   * faturas concretas, não a um fornecedor ou categoria agregados (esses
   * já respondidos por `topSuppliers`/`byCategory`, ordenados por
   * omissão desde esta fase). Mesmos filtros fechados de
   * `getFinancialSummary()` — nunca uma segunda semântica de `where`.
   */
  async getLargestInvoices(
    organizationId: string,
    query: FinancialSummaryQueryDto & FinancialSummaryFilters & { limit?: number },
  ): Promise<{ period: { from: string; to: string }; invoices: LargestInvoice[] }> {
    const period = resolvePeriod(query.from, query.to);
    const statusWhere: Prisma.InvoiceWhereInput = query.status
      ? { status: query.status }
      : { status: { not: InvoiceStatus.CANCELLED } };
    const where: Prisma.InvoiceWhereInput = {
      organizationId,
      issueDate: { gte: period.gte, lt: period.lt },
      ...statusWhere,
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    };

    const invoices = await this.prisma.invoice.findMany({
      where,
      orderBy: { totalAmount: 'desc' },
      take: query.limit ?? LARGEST_INVOICES_LIMIT,
      include: { supplier: { select: { name: true } }, category: { select: { name: true } } },
    });

    return {
      period: { from: period.from, to: period.to },
      invoices: invoices.map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        supplierName: invoice.supplier.name,
        categoryName: invoice.category?.name ?? SEM_CATEGORIA,
        issueDate: invoice.issueDate.toISOString().slice(0, 10),
        status: invoice.status,
        totalAmount: decimalToString(invoice.totalAmount),
      })),
    };
  }

  /**
   * Composição integral do Dashboard Financial Analysis (Fase 8.11) —
   * único ponto onde `FinancialInsights` é construído e o motor
   * (Fase 8.10) é executado para este endpoint; `DashboardController`
   * nunca faz nada disto, só delega aqui. `getFinancialSummary()`/
   * `getLargestInvoices()` são independentes entre si, por isso em
   * paralelo (`Promise.all`), mesma disciplina de `GET
   * /dashboard/financial-insights`. Seleção explícita e fechada das
   * análises registadas (`REGISTERED_FINANCIAL_ANALYSES`) — nunca
   * "todas as que existirem" no módulo `financial-analysis/`.
   */
  async getFinancialAnalysis(
    organizationId: string,
    query: FinancialSummaryQueryDto & FinancialSummaryFilters,
  ): Promise<DashboardFinancialAnalysisResponse> {
    const [summary, largest] = await Promise.all([
      this.getFinancialSummary(organizationId, query),
      this.getLargestInvoices(organizationId, query),
    ]);
    const insights = buildFinancialInsights(summary, largest.invoices);
    const analysis = runFinancialAnalyses(REGISTERED_FINANCIAL_ANALYSES, insights);
    return { insights, analysis };
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
