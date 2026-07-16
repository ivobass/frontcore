import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard, RolesGuard } from '@frontcore/auth';
import { PrismaModule } from '@frontcore/database';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { ExpenseCategoriesModule } from './expense-categories/expense-categories.module';
import { InvoicesModule } from './invoices/invoices.module';
import { UploadsModule } from './uploads/uploads.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    AuthModule,
    SuppliersModule,
    ExpenseCategoriesModule,
    InvoicesModule,
    UploadsModule,
    DashboardModule,
    AiModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
