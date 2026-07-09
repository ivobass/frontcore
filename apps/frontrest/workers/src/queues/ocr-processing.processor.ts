import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { QueueConsumer } from '@frontcore/queue';
import { PrismaService } from '@frontcore/database';
import type { ObjectStorage } from '@frontcore/storage';
import { OCRService } from '@frontcore/ocr';
import { OBJECT_STORAGE } from '../storage/object-storage.token';
import { QUEUE_CONSUMER } from './queue-consumer.token';

/** Nome da fila — partilhado por quem a vier a produzir em fases futuras. */
export const OCR_PROCESSING_QUEUE = 'ocr-processing';

/** Payload esperado de um job de processamento OCR. */
export interface OcrProcessingJob {
  storageObjectId: string;
  organizationId: string;
}

/**
 * Consumidor da fila `ocr-processing`. Fluxo (Fase 6.2): receber job →
 * obter ficheiro (`ObjectStorage.get`) → `OCRService.extract()` →
 * registar resultado → terminar job. Nenhuma lógica de OCR vive aqui —
 * o Worker não sabe qual é o provider concreto, nem como o texto é
 * extraído; só orquestra chamadas a `PrismaService`, `ObjectStorage` e
 * `OCRService`. "Guardar resultado" nesta fase é um registo estruturado
 * via `Logger` — persistência durável (BD ou storage) fica para quando
 * existir um consumidor real a decidir a forma (ver "Limitações
 * conhecidas" em `docs/phases/phase-6.2-ocr-pipeline-foundation.md`).
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
    const storageObject = await this.prisma.storageObject.findFirst({
      where: {
        id: payload.storageObjectId,
        organizationId: payload.organizationId,
        key: { not: null },
      },
    });
    if (!storageObject || !storageObject.key) {
      this.logger.warn(
        `Job ${jobId}: StorageObject ${payload.storageObjectId} não encontrado ` +
          `(organização ${payload.organizationId}) — job ignorado.`,
      );
      return;
    }

    const buffer = await this.storage.get(storageObject.key);
    const result = await this.ocrService.extract({
      buffer,
      contentType: storageObject.contentType,
      filename: storageObject.filename,
    });

    this.logger.log(
      `Job ${jobId} concluído — StorageObject ${storageObject.id}: ` +
        `${result.text.length} caracteres extraídos, confiança ${result.confidence}, ` +
        `${result.processingTimeMs}ms (provider "${result.provider}").`,
    );
  }
}
