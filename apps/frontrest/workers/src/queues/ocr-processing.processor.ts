import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { QueueConsumer } from '@frontcore/queue';
import { QUEUE_CONSUMER } from './queue-consumer.token';

/** Nome da fila — partilhado por quem a vier a produzir em fases futuras. */
export const OCR_PROCESSING_QUEUE = 'ocr-processing';

/** Payload esperado de um job de processamento OCR (fases futuras). */
export interface OcrProcessingJob {
  storageObjectId: string;
  organizationId: string;
}

/**
 * Consumidor mock da fila `ocr-processing` — prova o pipeline de filas
 * ponta a ponta (registo do consumidor, receção do job) sem nenhum motor
 * OCR real. Nenhuma leitura de `StorageObject`, nenhuma chamada a um
 * provider de OCR, nenhuma escrita em `Invoice` — fora do âmbito da
 * Fase 6.1.
 */
@Injectable()
export class OcrProcessingProcessor implements OnModuleInit {
  private readonly logger = new Logger(OcrProcessingProcessor.name);

  constructor(@Inject(QUEUE_CONSUMER) private readonly consumer: QueueConsumer) {}

  onModuleInit(): void {
    this.consumer.consume<OcrProcessingJob>(OCR_PROCESSING_QUEUE, async (payload, jobId) => {
      this.logger.log(
        `Job ${jobId} recebido — StorageObject ${payload.storageObjectId} ` +
          `(organização ${payload.organizationId}). Processamento OCR real fora do âmbito da Fase 6.1.`,
      );
    });
  }
}
