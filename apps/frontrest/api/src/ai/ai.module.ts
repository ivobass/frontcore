import { Module } from '@nestjs/common';
import { createAiProvider, loadAiConfig } from '@frontcore/ai';
import type { AiCompletionProvider } from '@frontcore/ai';
import { DashboardModule } from '../dashboard/dashboard.module';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { ExpenseCategoriesModule } from '../expense-categories/expense-categories.module';
import { AiController } from './ai.controller';
import { AiChatService } from './ai-chat.service';
import { AiTenantContextService } from './ai-tenant-context.service';
import { AI_COMPLETION_PROVIDER } from './ai-completion-provider.token';
import { FinancialRetrievalService } from './financial-retrieval/financial-retrieval.service';
import { FinancialEntityResolverService } from './financial-retrieval/entity-resolver.service';
import { AiToolOrchestratorService } from './tools/ai-tool-orchestrator.service';

/**
 * Único ponto de `apps/frontrest/api` que importa `createAiProvider`/
 * `loadAiConfig` diretamente — todo o resto só conhece o tipo
 * `AiCompletionProvider`, injetado via `AI_COMPLETION_PROVIDER` (mesmo
 * padrão de `OBJECT_STORAGE` em `uploads.module.ts`). Registado aqui
 * dentro, não num `ai-provider.module.ts` separado: sem ciclo de vida a
 * fechar no shutdown (`OllamaAiProvider`/`OpenRouterAiProvider` usam
 * `fetch` por pedido, sem ligação persistente — ao contrário de
 * `QueueProducer`, que por isso vive no seu próprio `QueueModule` com
 * `OnModuleDestroy`). `SuppliersModule`/`ExpenseCategoriesModule`
 * (Fase 8.4) reutilizados só para `FinancialEntityResolverService`
 * resolver nomes de fornecedor/categoria mencionados na mensagem —
 * nunca uma segunda query Prisma duplicada.
 *
 * `AI_COMPLETION_PROVIDER` exportado desde a Fase 6.14 — segundo
 * consumidor real (`AiInvoiceExtractionModule`, extração estruturada de
 * faturas) importa este módulo só por este token, nunca por
 * `AiChatService`/`AiController`/o resto do chat.
 */
@Module({
  imports: [DashboardModule, SuppliersModule, ExpenseCategoriesModule],
  controllers: [AiController],
  providers: [
    AiChatService,
    AiTenantContextService,
    FinancialRetrievalService,
    FinancialEntityResolverService,
    AiToolOrchestratorService,
    {
      provide: AI_COMPLETION_PROVIDER,
      useFactory: (): AiCompletionProvider => createAiProvider(loadAiConfig()),
    },
  ],
  exports: [AI_COMPLETION_PROVIDER],
})
export class AiModule {}
