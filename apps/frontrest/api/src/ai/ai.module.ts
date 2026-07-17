import { Module } from '@nestjs/common';
import { createAiProvider, loadAiConfig } from '@frontcore/ai';
import type { AiCompletionProvider } from '@frontcore/ai';
import { DashboardModule } from '../dashboard/dashboard.module';
import { AiController } from './ai.controller';
import { AiChatService } from './ai-chat.service';
import { AiTenantContextService } from './ai-tenant-context.service';
import { AI_COMPLETION_PROVIDER } from './ai-completion-provider.token';
import { FinancialRetrievalService } from './financial-retrieval/financial-retrieval.service';

/**
 * Único ponto de `apps/frontrest/api` que importa `createAiProvider`/
 * `loadAiConfig` diretamente — `AiChatService` só conhece o tipo
 * `AiCompletionProvider`, injetado via `AI_COMPLETION_PROVIDER` (mesmo
 * padrão de `OBJECT_STORAGE` em `uploads.module.ts`). Registado aqui
 * dentro, não num `ai-provider.module.ts` separado: único consumidor
 * real hoje (`AiChatService`) e sem ciclo de vida a fechar no shutdown
 * (`OllamaAiProvider` usa `fetch` por pedido, sem ligação persistente —
 * ao contrário de `QueueProducer`, que por isso vive no seu próprio
 * `QueueModule` com `OnModuleDestroy`).
 */
@Module({
  imports: [DashboardModule],
  controllers: [AiController],
  providers: [
    AiChatService,
    AiTenantContextService,
    FinancialRetrievalService,
    {
      provide: AI_COMPLETION_PROVIDER,
      useFactory: (): AiCompletionProvider => createAiProvider(loadAiConfig()),
    },
  ],
})
export class AiModule {}
