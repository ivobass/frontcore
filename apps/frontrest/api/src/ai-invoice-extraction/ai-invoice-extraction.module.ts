import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AiInvoiceExtractor } from './ai-invoice-extractor.service';

/**
 * Extração estruturada de fatura por IA (Fase 6.14) — segundo
 * consumidor real de `AI_COMPLETION_PROVIDER` (o primeiro é o Chat IA,
 * Fase 8). Importa `AiModule` só pelo token exportado (nunca por
 * `AiChatService`/`AiController`) — `AiInvoiceExtractor` nunca sabe que
 * providers concretos existem, só o contrato `AiCompletionProvider`.
 */
@Module({
  imports: [AiModule],
  providers: [AiInvoiceExtractor],
  exports: [AiInvoiceExtractor],
})
export class AiInvoiceExtractionModule {}
