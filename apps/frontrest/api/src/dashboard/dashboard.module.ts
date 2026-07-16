import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
  // Exportado para o módulo de chat IA (Fase 8) reutilizar
  // `DashboardService` via DI, em vez de duplicar as queries de
  // agregação ou fazer um pedido HTTP interno.
  exports: [DashboardService],
})
export class DashboardModule {}
