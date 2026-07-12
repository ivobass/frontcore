import { Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { BullMQQueueConsumer, loadQueueConfig } from '@frontcore/queue';
import type { QueueConsumer } from '@frontcore/queue';
import { S3ObjectStorage, loadStorageConfig } from '@frontcore/storage';
import type { ObjectStorage } from '@frontcore/storage';
import { OCRService, createOcrProvider, createPdfRasterizer, loadOcrConfig } from '@frontcore/ocr';
import { OBJECT_STORAGE } from '../storage/object-storage.token';
import { QUEUE_CONSUMER } from './queue-consumer.token';
import { OcrProcessingProcessor } from './ocr-processing.processor';

@Module({
  providers: [
    {
      provide: QUEUE_CONSUMER,
      useFactory: (): QueueConsumer => new BullMQQueueConsumer(loadQueueConfig()),
    },
    {
      provide: OBJECT_STORAGE,
      useFactory: (): ObjectStorage => new S3ObjectStorage(loadStorageConfig()),
    },
    {
      provide: OCRService,
      useFactory: (): OCRService => {
        const config = loadOcrConfig();
        return new OCRService(createOcrProvider(config), createPdfRasterizer(), {
          maxPages: config.pdfMaxPages,
          dpi: config.pdfDpi,
          maxDimensionPx: config.pdfMaxDimensionPx,
          timeoutMs: config.pdfRasterTimeoutMs,
        });
      },
    },
    OcrProcessingProcessor,
  ],
})
export class OcrProcessingModule implements OnModuleDestroy {
  constructor(@Inject(QUEUE_CONSUMER) private readonly consumer: QueueConsumer) {}

  // Mesmo padrão de apps/frontrest/api/src/queue/queue.module.ts para o
  // produtor — sem isto, o Worker (`main.ts` já chama
  // `app.enableShutdownHooks()`) nunca fechava a ligação Redis do
  // consumidor num SIGTERM/SIGINT real.
  async onModuleDestroy(): Promise<void> {
    await this.consumer.close();
  }
}
