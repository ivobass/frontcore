import { Module } from '@nestjs/common';
import { DashboardModule } from '../dashboard/dashboard.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/**
 * `ReportsService` reutiliza exclusivamente a API pública de
 * `DashboardService` (`getFinancialSummary()`) — nunca conhece os seus
 * métodos privados nem duplica nenhuma query de agregação financeira.
 */
@Module({
  imports: [DashboardModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
