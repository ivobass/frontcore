import { Test } from '@nestjs/testing';
import type { JobHandler, QueueConsumer } from '@frontcore/queue';
import { PrismaService } from '@frontcore/database';
import { OCRService } from '@frontcore/ocr';
import type { OCRResult } from '@frontcore/ocr';
import { OcrProcessingProcessor, OCR_PROCESSING_QUEUE } from './ocr-processing.processor';
import type { OcrProcessingJob } from './ocr-processing.processor';
import { QUEUE_CONSUMER } from './queue-consumer.token';
import { OBJECT_STORAGE } from '../storage/object-storage.token';

describe('OcrProcessingProcessor', () => {
  function buildProcessor(overrides: {
    findFirst?: jest.Mock;
    get?: jest.Mock;
    extract?: jest.Mock;
  }) {
    let registeredHandler: JobHandler<OcrProcessingJob> | undefined;
    const consumeMock = jest.fn((_queueName: string, handler: JobHandler<OcrProcessingJob>) => {
      registeredHandler = handler;
    });

    return {
      consumeMock,
      getHandler: () => registeredHandler,
      providers: [
        OcrProcessingProcessor,
        { provide: QUEUE_CONSUMER, useValue: { consume: consumeMock, close: jest.fn() } },
        { provide: OBJECT_STORAGE, useValue: { get: overrides.get ?? jest.fn() } },
        {
          provide: PrismaService,
          useValue: { storageObject: { findFirst: overrides.findFirst ?? jest.fn() } },
        },
        { provide: OCRService, useValue: { extract: overrides.extract ?? jest.fn() } },
      ],
    };
  }

  it('regista um consumidor para a fila ocr-processing ao iniciar o módulo', async () => {
    const { consumeMock, providers } = buildProcessor({});
    const moduleRef = await Test.createTestingModule({ providers }).compile();

    moduleRef.get(OcrProcessingProcessor).onModuleInit();

    expect(consumeMock).toHaveBeenCalledWith(OCR_PROCESSING_QUEUE, expect.any(Function));
  });

  it('fluxo completo: obtém o ficheiro, executa OCRService.extract() e regista o resultado', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 'obj-1',
      key: 'organizations/org-1/uploads/obj-1',
      contentType: 'image/png',
      filename: 'fatura.png',
    });
    const get = jest.fn().mockResolvedValue(Buffer.from('bytes'));
    const result: OCRResult = {
      provider: 'tesseract',
      language: 'eng',
      confidence: 91,
      processingTimeMs: 120,
      pages: 1,
      text: 'texto extraído',
    };
    const extract = jest.fn().mockResolvedValue(result);

    const { providers, getHandler } = buildProcessor({ findFirst, get, extract });
    const moduleRef = await Test.createTestingModule({ providers }).compile();
    moduleRef.get(OcrProcessingProcessor).onModuleInit();

    await getHandler()!({ storageObjectId: 'obj-1', organizationId: 'org-1' }, 'job-1');

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'obj-1', organizationId: 'org-1', key: { not: null } },
    });
    expect(get).toHaveBeenCalledWith('organizations/org-1/uploads/obj-1');
    expect(extract).toHaveBeenCalledWith({
      buffer: Buffer.from('bytes'),
      contentType: 'image/png',
      filename: 'fatura.png',
    });
  });

  it('não chama storage nem OCRService quando o StorageObject não é encontrado', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const get = jest.fn();
    const extract = jest.fn();

    const { providers, getHandler } = buildProcessor({ findFirst, get, extract });
    const moduleRef = await Test.createTestingModule({ providers }).compile();
    moduleRef.get(OcrProcessingProcessor).onModuleInit();

    await expect(
      getHandler()!({ storageObjectId: 'obj-x', organizationId: 'org-1' }, 'job-1'),
    ).resolves.toBeUndefined();

    expect(get).not.toHaveBeenCalled();
    expect(extract).not.toHaveBeenCalled();
  });
});
