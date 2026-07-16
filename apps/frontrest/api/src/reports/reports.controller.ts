import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, type AuthenticatedIdentity } from '@frontcore/auth';
import { ReportsService } from './reports.service';
import { MonthlyReportQueryDto } from './dto/monthly-report-query.dto';
import { serializeMonthlyReportToCsv } from './serializers/csv.serializer';
import { serializeMonthlyReportToPdf } from './serializers/pdf.serializer';
import { currentMonth } from './month.util';

/** Nome de ficheiro seguro — `month` já validado pelo DTO (`\d{4}-\d{2}`), nunca contém input livre do utilizador. */
function reportFilename(month: string, extension: string): string {
  return `relatorio-financeiro-${month}.${extension}`;
}

/**
 * Sem `@Roles` em nenhuma rota — mesmo alcance de `GET /dashboard/financial-summary`/
 * `GET /invoices`. `organizationId` vem sempre de `CurrentUser()`, nunca
 * do pedido. JSON/CSV/PDF chamam sempre `ReportsService.getMonthlyReport()`
 * — nunca uma query diferente por formato.
 */
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('monthly')
  getMonthly(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Query() query: MonthlyReportQueryDto,
  ) {
    return this.reportsService.getMonthlyReport(identity.organizationId, query.month ?? currentMonth());
  }

  @Get('monthly.csv')
  async getMonthlyCsv(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Query() query: MonthlyReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const month = query.month ?? currentMonth();
    const report = await this.reportsService.getMonthlyReport(identity.organizationId, month);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${reportFilename(month, 'csv')}"`);
    return serializeMonthlyReportToCsv(report);
  }

  /**
   * `@Res()` sem `passthrough` — devolver um `Buffer` diretamente do
   * método (mesmo com `passthrough: true`) faz o NestJS tratá-lo como
   * objeto serializável e responder com `response.json(buffer)`
   * (`{"type":"Buffer","data":[...]}`), nunca os bytes binários reais.
   * `res.send(buffer)` explícito é o único caminho correto para uma
   * resposta binária — confirmado real por teste e2e (ver
   * `test/reports.e2e-spec.ts`).
   */
  @Get('monthly.pdf')
  async getMonthlyPdf(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Query() query: MonthlyReportQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const month = query.month ?? currentMonth();
    const report = await this.reportsService.getMonthlyReport(identity.organizationId, month);
    const pdf = await serializeMonthlyReportToPdf(report);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${reportFilename(month, 'pdf')}"`);
    res.send(pdf);
  }
}
