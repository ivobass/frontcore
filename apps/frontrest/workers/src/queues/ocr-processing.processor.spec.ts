import { Test } from '@nestjs/testing';
import type { JobHandler, QueueConsumer } from '@frontcore/queue';
import { OcrProcessingProcessor, OCR_PROCESSING_QUEUE } from './ocr-processing.processor';
import { QUEUE_CONSUMER } from './queue-consumer.token';

describe('OcrProcessingProcessor', () => {
  it('regista um consumidor para a fila ocr-processing ao iniciar o módulo', async () => {
    const consumeMock = jest.fn();
    const consumer: QueueConsumer = { consume: consumeMock, close: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [OcrProcessingProcessor, { provide: QUEUE_CONSUMER, useValue: consumer }],
    }).compile();

    moduleRef.get(OcrProcessingProcessor).onModuleInit();

    expect(consumeMock).toHaveBeenCalledWith(OCR_PROCESSING_QUEUE, expect.any(Function));
  });

  it('o handler registado processa um job mock sem lançar', async () => {
    let registeredHandler: JobHandler<{ storageObjectId: string; organizationId: string }> | undefined;
    const consumer: QueueConsumer = {
      consume: (_queueName, handler) => {
        registeredHandler = handler as typeof registeredHandler;
      },
      close: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [OcrProcessingProcessor, { provide: QUEUE_CONSUMER, useValue: consumer }],
    }).compile();

    moduleRef.get(OcrProcessingProcessor).onModuleInit();

    await expect(
      registeredHandler!({ storageObjectId: 'obj-1', organizationId: 'org-1' }, 'job-1'),
    ).resolves.toBeUndefined();
  });
});
