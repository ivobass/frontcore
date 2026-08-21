import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AiCompletionProvider } from '@frontcore/ai';
import { AiProviderError } from '@frontcore/ai';
import { AI_COMPLETION_PROVIDER } from '../ai/ai-completion-provider.token';
import { AI_INVOICE_EXTRACTION_RESPONSE_FORMAT } from './ai-invoice-extraction.schema';
import { AI_INVOICE_EXTRACTION_SYSTEM_PROMPT } from './ai-invoice-extraction.prompt';
import { parseAiInvoiceExtraction } from './ai-invoice-extraction.parser';
import type { AiInvoiceExtractionV1 } from './types/ai-invoice-extraction';

/** Metadata da última chamada real ao provider — nunca inclui o `ocrText` nem o conteúdo bruto da resposta. */
export interface AiInvoiceExtractionMetadata {
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
}

export interface AiInvoiceExtractionOutcome {
  extraction: AiInvoiceExtractionV1 | null;
  metadata: AiInvoiceExtractionMetadata | null;
}

/**
 * Extração estruturada de fatura por IA (Fase 6.14) — UMA única chamada
 * `AiCompletionProvider.complete()` por documento (nunca um extractor
 * por campo), `responseFormat` pede structured output ao provider,
 * `parseAiInvoiceExtraction()` valida estruturalmente antes de confiar
 * em qualquer campo. Complementa `FiscalParsingService` (`fiscal-parsing/`,
 * regex/heurísticas, inalterado) — nunca o substitui; o pipeline de
 * documentos continua a correr ambos e a reconciliar
 * (`invoice-extraction-merger.ts`).
 *
 * Nunca lança para o chamador — qualquer falha (provider indisponível,
 * `unsupported_capability` do Ollama, JSON inválido, resposta fora do
 * schema) é tratada como "sem sugestão de IA disponível", nunca como
 * erro fatal do pipeline: o parsing determinístico continua a ser a
 * fonte fiável mesmo quando a IA falha. O detalhe real do erro é sempre
 * registado server-side (`Logger.warn()`, mesmo padrão de
 * `AiChatService`), nunca propagado ao chamador.
 */
@Injectable()
export class AiInvoiceExtractor {
  private readonly logger = new Logger(AiInvoiceExtractor.name);

  constructor(@Inject(AI_COMPLETION_PROVIDER) private readonly aiProvider: AiCompletionProvider) {}

  async extract(ocrText: string): Promise<AiInvoiceExtractionOutcome> {
    if (!ocrText || ocrText.trim().length === 0) {
      return { extraction: null, metadata: null };
    }

    const startedAt = Date.now();
    try {
      const response = await this.aiProvider.complete({
        messages: [
          { role: 'system', content: AI_INVOICE_EXTRACTION_SYSTEM_PROMPT },
          { role: 'user', content: ocrText },
        ],
        responseFormat: AI_INVOICE_EXTRACTION_RESPONSE_FORMAT,
      });
      const durationMs = Date.now() - startedAt;
      const metadata: AiInvoiceExtractionMetadata = {
        provider: response.provider,
        model: response.model,
        inputTokens: response.usage?.inputTokens ?? null,
        outputTokens: response.usage?.outputTokens ?? null,
        durationMs,
      };

      const extraction = parseAiInvoiceExtraction(response.content);
      if (!extraction) {
        this.logger.warn('Resposta do provider de IA não respeita o schema de extração de fatura — ignorada.');
      }
      return { extraction, metadata };
    } catch (error) {
      if (error instanceof AiProviderError) {
        this.logger.warn(`Extração de fatura por IA indisponível (${error.code}): ${error.message}`);
      } else {
        this.logger.warn('Falha inesperada na extração de fatura por IA.', error instanceof Error ? error.stack : undefined);
      }
      return { extraction: null, metadata: null };
    }
  }
}
