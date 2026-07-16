import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser, type AuthenticatedIdentity } from '@frontcore/auth';
import { DashboardService } from './dashboard.service';
import { FinancialSummaryQueryDto } from './dto/financial-summary-query.dto';

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
}
