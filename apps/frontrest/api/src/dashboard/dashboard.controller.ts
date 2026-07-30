import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser, type AuthenticatedIdentity } from '@frontcore/auth';
import { DashboardService, type DashboardFinancialAnalysisResponse } from './dashboard.service';
import { FinancialSummaryQueryDto } from './dto/financial-summary-query.dto';
import { buildFinancialInsights } from '../financial-insights/financial-insights.util';
import type { FinancialInsights } from '../financial-insights/financial-insights.types';

/** Sem `@Roles` — qualquer utilizador autenticado da organização, mesmo alcance de `GET /invoices` (Fase 7). A organização vem sempre da identidade autenticada, nunca de um parâmetro do pedido. */
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('financial-summary')
  getFinancialSummary(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Query() query: FinancialSummaryQueryDto,
  ) {
    return this.dashboardService.getFinancialSummary(identity.organizationId, query);
  }

  /**
   * Financial Insights (Fase 8.9) — mesmo período de `financial-summary`;
   * `getFinancialSummary()`/`getLargestInvoices()` são independentes
   * entre si, por isso corridos em paralelo via `Promise.all`, nunca
   * sequencialmente. `buildFinancialInsights()` nunca acede ao Prisma —
   * deriva só do que as duas APIs públicas de `DashboardService` já
   * devolveram, a mesma função reutilizada pelo Chat IA e por
   * `ReportsService`.
   */
  @Get('financial-insights')
  async getFinancialInsights(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Query() query: FinancialSummaryQueryDto,
  ): Promise<FinancialInsights> {
    const [summary, largest] = await Promise.all([
      this.dashboardService.getFinancialSummary(identity.organizationId, query),
      this.dashboardService.getLargestInvoices(identity.organizationId, query),
    ]);
    return buildFinancialInsights(summary, largest.invoices);
  }

  /**
   * Financial Analysis Engine (Fase 8.11) — o controller só recebe e
   * valida o pedido HTTP, obtém `organizationId` de `CurrentUser` e
   * delega; toda a composição (paralelismo, construção de
   * `FinancialInsights`, seleção das análises, execução do motor) vive
   * em `DashboardService.getFinancialAnalysis()`, nunca aqui.
   */
  @Get('financial-analysis')
  getFinancialAnalysis(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Query() query: FinancialSummaryQueryDto,
  ): Promise<DashboardFinancialAnalysisResponse> {
    return this.dashboardService.getFinancialAnalysis(identity.organizationId, query);
  }
}
