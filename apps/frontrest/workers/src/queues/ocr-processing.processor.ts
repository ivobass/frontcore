import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { QueueConsumer } from '@frontcore/queue';
import { OCR_PROCESSING_QUEUE } from '@frontcore/queue';
import type { OcrProcessingJob } from '@frontcore/queue';
import { PrismaService } from '@frontcore/database';
import type { ObjectStorage } from '@frontcore/storage';
import { OCRService } from '@frontcore/ocr';
import { OBJECT_STORAGE } from '../storage/object-storage.token';
import { QUEUE_CONSUMER } from './queue-consumer.token';

/**
 * Consumidor da fila `ocr-processing`. Fluxo (Fase 6.4): receber job →
 * validar que o `InvoiceDraft` referenciado ainda existe, pertence à
 * organização do job e corresponde ao `storageObjectId` → validar que o
 * `StorageObject` ainda existe, pertence à mesma organização e tem `key`
 * → obter ficheiro (`ObjectStorage.get`) → `OCRService.extract()` →
 * persistir `ocrText`/`ocrConfidence` no `InvoiceDraft`, revalidando a
 * mesma correspondência (id + organização + storageObjectId) no momento
 * da escrita, para cobrir a corrida entre o início e o fim do OCR (o
 * draft pode ter sido eliminado ou promovido enquanto o OCR corria).
 * Nenhuma lógica de OCR vive aqui — o Worker não sabe qual é o provider
 * concreto, nem como o texto é extraído; só orquestra chamadas a
 * `PrismaService`, `ObjectStorage` e `OCRService`. O Worker nunca
 * promove um draft nem cria/altera uma `Invoice` — essas operações
 * pertencem exclusivamente a `InvoiceDraftsService.promote()`, do lado
 * da API.
 */
@Injectable()
export class OcrProcessingProcessor implements OnModuleInit {
  private readonly logger = new Logger(OcrProcessingProcessor.name);

  constructor(
    @Inject(QUEUE_CONSUMER) private readonly consumer: QueueConsumer,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly prisma: PrismaService,
    private readonly ocrService: OCRService,
  ) {}

  onModuleInit(): void {
    this.consumer.consume<OcrProcessingJob>(OCR_PROCESSING_QUEUE, async (payload, jobId) => {
      await this.process(payload, jobId);
    });
  }

  private async process(payload: OcrProcessingJob, jobId: string): Promise<void> {
    const draft = await this.prisma.invoiceDraft.findFirst({
      where: {
        id: payload.invoiceDraftId,
        organizationId: payload.organizationId,
        storageObjectId: payload.storageObjectId,
      },
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

    const buffer = await this.storage.get(storageObject.key);
    const result = await this.ocrService.extract({
      buffer,
      contentType: storageObject.contentType,
      filename: storageObject.filename,
    });

    // Revalida a mesma correspondência antes de escrever — cobre a corrida
    // em que o draft foi eliminado ou promovido enquanto o OCR corria.
    const updated = await this.prisma.invoiceDraft.updateMany({
      where: {
        id: payload.invoiceDraftId,
        organizationId: payload.organizationId,
        storageObjectId: payload.storageObjectId,
      },
      data: {
        ocrText: result.text,
        ocrConfidence: result.confidence,
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
  }
}
