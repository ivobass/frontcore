import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { JobAttemptInfo, QueueConsumer } from '@frontcore/queue';
import { OCR_PROCESSING_QUEUE } from '@frontcore/queue';
import type { OcrProcessingJob } from '@frontcore/queue';
import type { Prisma } from '@frontcore/database';
import { PrismaService } from '@frontcore/database';
import type { ObjectStorage } from '@frontcore/storage';
import {
  OCRService,
  loadOcrConfig,
  OCRExtractionError,
  OCRProviderError,
  OCRTimeoutError,
  OCRUnsupportedFormatError,
  PdfInvalidError,
  PdfProtectedError,
  PdfPageLimitExceededError,
  PdfRasterizationTimeoutError,
  PdfRasterizerError,
} from '@frontcore/ocr';
import type { ExtractOptions } from '@frontcore/ocr';
import { OBJECT_STORAGE } from '../storage/object-storage.token';
import { QUEUE_CONSUMER } from './queue-consumer.token';

/**
 * Mensagem sanitizada para `InvoiceDraft.ocrError` — nunca `error.message`
 * bruta. Este campo é devolvido por `GET /invoices/drafts` a qualquer
 * membro autenticado da organização (mesmo princípio já aplicado à
 * mensagem de erro de publicação do job, Fase 6.4); detalhe técnico
 * completo (stack incluída) só vai para os logs do Worker, nunca para a
 * base de dados. Reutiliza a taxonomia de erros já existente em
 * `@frontcore/ocr` — nenhuma classe de erro nova criada para isto.
 */
function sanitizeOcrError(error: unknown): string {
  if (error instanceof OCRTimeoutError) {
    return 'Tempo limite excedido durante o processamento OCR.';
  }
  if (error instanceof OCRUnsupportedFormatError) {
    return 'Formato de ficheiro não suportado pelo motor de OCR.';
  }
  // PDF (Fase 6.9) — nunca a mensagem bruta do Poppler (stderr/path/comando),
  // só as 4 mensagens fixas abaixo. Ver PopplerPdfRasterizer para a
  // classificação de erro correspondente.
  if (error instanceof PdfInvalidError || error instanceof PdfProtectedError) {
    return 'Documento PDF inválido, corrompido ou protegido.';
  }
  if (error instanceof PdfPageLimitExceededError) {
    return 'Documento PDF excede os limites de processamento.';
  }
  if (error instanceof PdfRasterizationTimeoutError) {
    return 'Tempo limite excedido durante a preparação do documento.';
  }
  if (error instanceof PdfRasterizerError) {
    return 'Falha ao preparar o documento para OCR.';
  }
  if (error instanceof OCRProviderError || error instanceof OCRExtractionError) {
    return 'Falha no motor de OCR.';
  }
  return 'Falha técnica durante o processamento OCR.';
}

type DraftIdentity = Pick<OcrProcessingJob, 'invoiceDraftId' | 'organizationId' | 'storageObjectId'>;

/**
 * Consumidor da fila `ocr-processing`. Fluxo: receber job → validar que o
 * `InvoiceDraft` referenciado ainda existe, pertence à organização do job
 * e corresponde ao `storageObjectId` → validar que o `StorageObject`
 * ainda existe, pertence à mesma organização e tem `key` → marcar
 * `ocrStatus: PROCESSING` → obter ficheiro (`ObjectStorage.get`) →
 * `OCRService.extract()` → persistir `ocrText`/`ocrConfidence` e
 * `ocrStatus: COMPLETED`. Em todos os pontos de escrita, revalida a mesma
 * correspondência (id + organização + storageObjectId) — cobre a corrida
 * em que o draft foi eliminado ou promovido enquanto o OCR corria.
 * Nenhuma lógica de OCR vive aqui — o Worker não sabe qual é o provider
 * concreto, nem como o texto é extraído; só orquestra chamadas a
 * `PrismaService`, `ObjectStorage` e `OCRService`. O Worker nunca
 * promove um draft nem cria/altera uma `Invoice` — essas operações
 * pertencem exclusivamente a `InvoiceDraftsService.promote()`, do lado
 * da API.
 *
 * Retry & Recovery (Fase 6.5): falhas técnicas (storage/OCR/Prisma)
 * continuam a propagar — é o BullMQ, via `attempts`/`backoff`
 * configurados em `InvoiceDraftsService.create()`, quem decide se e
 * quando volta a chamar este handler; nenhuma contagem de tentativas ou
 * atraso é reimplementado aqui. O que este processor acrescenta é só a
 * tradução desse ciclo de vida para o domínio: `ocrStatus: PROCESSING`
 * no início de cada tentativa, `PENDING` se ainda houver tentativas por
 * esgotar (falha temporária), `FAILED` + `ocrError` sanitizado quando o
 * `JobAttemptInfo` recebido indica que esta era a última tentativa
 * permitida (falha permanente).
 */
@Injectable()
export class OcrProcessingProcessor implements OnModuleInit {
  private readonly logger = new Logger(OcrProcessingProcessor.name);

  // OCR_LANGUAGE/OCR_TIMEOUT_MS: mesma fonte (loadOcrConfig()) já usada em
  // ocr-processing.module.ts para escolher o provider.
  private readonly extractOptions: ExtractOptions = (() => {
    const config = loadOcrConfig();
    return { language: config.language, timeoutMs: config.timeoutMs };
  })();

  constructor(
    @Inject(QUEUE_CONSUMER) private readonly consumer: QueueConsumer,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly prisma: PrismaService,
    private readonly ocrService: OCRService,
  ) {}

  onModuleInit(): void {
    this.consumer.consume<OcrProcessingJob>(OCR_PROCESSING_QUEUE, async (payload, jobId, attempt) => {
      await this.process(payload, jobId, attempt);
    });
  }

  private draftWhere(payload: DraftIdentity): Prisma.InvoiceDraftWhereInput {
    return {
      id: payload.invoiceDraftId,
      organizationId: payload.organizationId,
      storageObjectId: payload.storageObjectId,
    };
  }

  private async process(
    payload: OcrProcessingJob,
    jobId: string,
    attempt: JobAttemptInfo,
  ): Promise<void> {
    const draft = await this.prisma.invoiceDraft.findFirst({
      where: this.draftWhere(payload),
      select: { id: true },
    });
    if (!draft) {
      this.logger.warn(
        `Job ${jobId}: InvoiceDraft ${payload.invoiceDraftId} não encontrado, não pertence à ` +
          `organização ${payload.organizationId}, ou já não corresponde ao StorageObject ` +
          `${payload.storageObjectId} — provavelmente eliminado ou promovido antes do ` +
          `processamento. Job ignorado, sem retry.`,
      );
      return;
    }

    const storageObject = await this.prisma.storageObject.findFirst({
      where: {
        id: payload.storageObjectId,
        organizationId: payload.organizationId,
        key: { not: null },
      },
    });
    if (!storageObject || !storageObject.key) {
      this.logger.warn(
        `Job ${jobId}: StorageObject ${payload.storageObjectId} não encontrado, sem key válida, ` +
          `ou não pertence à organização ${payload.organizationId} — job ignorado, sem retry.`,
      );
      return;
    }

    const claimed = await this.prisma.invoiceDraft.updateMany({
      where: this.draftWhere(payload),
      data: { ocrStatus: 'PROCESSING' },
    });
    if (claimed.count === 0) {
      this.logger.warn(
        `Job ${jobId}: InvoiceDraft ${payload.invoiceDraftId} deixou de corresponder à ` +
          `combinação id+organização+storageObjectId antes do início do OCR — provavelmente ` +
          `eliminado ou promovido. Job ignorado, sem retry.`,
      );
      return;
    }

    this.logger.log(
      `Job ${jobId}: a iniciar processamento do InvoiceDraft ${payload.invoiceDraftId} ` +
        `(tentativa ${attempt.attemptNumber}/${attempt.maxAttempts}).`,
    );

    try {
      const buffer = await this.storage.get(storageObject.key);
      const result = await this.ocrService.extract(
        {
          buffer,
          contentType: storageObject.contentType,
          filename: storageObject.filename,
        },
        this.extractOptions,
      );

      const updated = await this.prisma.invoiceDraft.updateMany({
        where: this.draftWhere(payload),
        data: {
          ocrText: result.text,
          ocrConfidence: result.confidence,
          ocrStatus: 'COMPLETED',
          ocrError: null,
        },
      });

      if (updated.count === 0) {
        this.logger.warn(
          `Job ${jobId}: InvoiceDraft ${payload.invoiceDraftId} deixou de existir (eliminado ou ` +
            `promovido) durante a extração OCR — resultado descartado, sem retry.`,
        );
        return;
      }

      this.logger.log(
        `Job ${jobId} concluído — InvoiceDraft ${payload.invoiceDraftId}: ` +
          `${result.text.length} caracteres extraídos, confiança ${result.confidence} ` +
          `(provider "${result.provider}").`,
      );
    } catch (error) {
      const isLastAttempt = attempt.attemptNumber >= attempt.maxAttempts;
      const message = error instanceof Error ? error.message : String(error);

      // Try/catch interno: uma falha ao escrever o estado (ex. Prisma
      // também em baixo) não pode mascarar o erro original propagado no
      // fim — o BullMQ e os logs devem sempre ver a causa real.
      try {
        if (isLastAttempt) {
          await this.prisma.invoiceDraft.updateMany({
            where: this.draftWhere(payload),
            data: { ocrStatus: 'FAILED', ocrError: sanitizeOcrError(error) },
          });
          this.logger.error(
            `Job ${jobId}: falha permanente após ${attempt.maxAttempts} tentativa(s) — ` +
              `InvoiceDraft ${payload.invoiceDraftId} marcado como FAILED. Motivo: ${message}`,
            error instanceof Error ? error.stack : undefined,
          );
        } else {
          await this.prisma.invoiceDraft.updateMany({
            where: this.draftWhere(payload),
            data: { ocrStatus: 'PENDING' },
          });
          this.logger.warn(
            `Job ${jobId}: falha temporária na tentativa ${attempt.attemptNumber}/` +
              `${attempt.maxAttempts} — retry agendado automaticamente pelo BullMQ ` +
              `(backoff exponencial). Motivo: ${message}`,
          );
        }
      } catch (statusWriteError) {
        this.logger.error(
          `Job ${jobId}: falha adicional ao atualizar ocrStatus do InvoiceDraft ` +
            `${payload.invoiceDraftId} após o erro original — estado pode ficar ` +
            `desatualizado até ao próximo retry.`,
          statusWriteError instanceof Error ? statusWriteError.stack : undefined,
        );
      }

      // Propaga sempre o erro original — é o que faz o BullMQ contar a
      // tentativa e, com base em attempts/backoff, decidir se agenda o
      // próximo retry.
      throw error;
    }
  }
}
