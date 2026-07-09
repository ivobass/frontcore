import { Module } from '@nestjs/common';
import { BullMQQueueConsumer, loadQueueConfig } from '@frontcore/queue';
import type { QueueConsumer } from '@frontcore/queue';
import { QUEUE_CONSUMER } from './queue-consumer.token';
import { OcrProcessingProcessor } from './ocr-processing.processor';

@Module({
  providers: [
    {
      provide: QUEUE_CONSUMER,
      useFactory: (): QueueConsumer => new BullMQQueueConsumer(loadQueueConfig()),
    },
    OcrProcessingProcessor,
  ],
})
export class OcrProcessingModule {}
