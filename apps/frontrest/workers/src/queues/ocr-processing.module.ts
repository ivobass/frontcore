import { Module } from '@nestjs/common';
import { BullMQQueueConsumer, loadQueueConfig } from '@frontcore/queue';
import type { QueueConsumer } from '@frontcore/queue';
import { S3ObjectStorage, loadStorageConfig } from '@frontcore/storage';
import type { ObjectStorage } from '@frontcore/storage';
import { OCRService, createOcrProvider, loadOcrConfig } from '@frontcore/ocr';
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
      useFactory: (): OCRService => new OCRService(createOcrProvider(loadOcrConfig())),
    },
    OcrProcessingProcessor,
  ],
})
export class OcrProcessingModule {}
