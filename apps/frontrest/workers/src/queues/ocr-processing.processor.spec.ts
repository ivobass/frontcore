import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import type { JobHandler, OcrProcessingJob } from '@frontcore/queue';
import type { QueueConsumer } from '@frontcore/queue';
import { OCR_PROCESSING_QUEUE } from '@frontcore/queue';
import { PrismaService } from '@frontcore/database';
import { OCRService } from '@frontcore/ocr';
import type { OCRResult } from '@frontcore/ocr';
import { OcrProcessingProcessor } from './ocr-processing.processor';
import { QUEUE_CONSUMER } from './queue-consumer.token';
import { OBJECT_STORAGE } from '../storage/object-storage.token';

describe('OcrProcessingProcessor', () => {
  const PAYLOAD: OcrProcessingJob = {
    invoiceDraftId: 'draft-1',
    storageObjectId: 'obj-1',
    organizationId: 'org-1',
  };

  function buildProcessor(overrides: {
    draftFindFirst?: jest.Mock;
    storageFindFirst?: jest.Mock;
    updateMany?: jest.Mock;
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
          useValue: {
            invoiceDraft: {
              findFirst: overrides.draftFindFirst ?? jest.fn(),
              updateMany: overrides.updateMany ?? jest.fn(),
            },
            storageObject: { findFirst: overrides.storageFindFirst ?? jest.fn() },
          },
        },
        { provide: OCRService, useValue: { extract: overrides.extract ?? jest.fn() } },
      ],
    };
  }

  const VALID_DRAFT = { id: 'draft-1' };
  const VALID_STORAGE_OBJECT = {
    id: 'obj-1',
    key: 'organizations/org-1/uploads/obj-1',
    contentType: 'image/png',
    filename: 'fatura.png',
  };
  const OCR_RESULT: OCRResult = {
    provider: 'tesseract',
    language: 'eng',
    confidence: 91,
    processingTimeMs: 120,
    pages: 1,
    text: 'texto extraído',
  };

  it('regista um consumidor para a fila ocr-processing ao iniciar o módulo', async () => {
    const { consumeMock, providers } = buildProcessor({});
    const moduleRef = await Test.createTestingModule({ providers }).compile();

    moduleRef.get(OcrProcessingProcessor).onModuleInit();

    expect(consumeMock).toHaveBeenCalledWith(OCR_PROCESSING_QUEUE, expect.any(Function));
  });

  describe('1. job válido', () => {
    it('encontra o draft, encontra o storage, obtém o ficheiro, executa OCR e persiste ocrText/ocrConfidence', async () => {
      const draftFindFirst = jest.fn().mockResolvedValue(VALID_DRAFT);
      const storageFindFirst = jest.fn().mockResolvedValue(VALID_STORAGE_OBJECT);
      const get = jest.fn().mockResolvedValue(Buffer.from('bytes'));
      const extract = jest.fn().mockResolvedValue(OCR_RESULT);
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });

      const { providers, getHandler } = buildProcessor({
        draftFindFirst,
        storageFindFirst,
        get,
        extract,
        updateMany,
      });
      const moduleRef = await Test.createTestingModule({ providers }).compile();
      moduleRef.get(OcrProcessingProcessor).onModuleInit();

      await getHandler()!(PAYLOAD, 'job-1');

      expect(draftFindFirst).toHaveBeenCalledWith({
        where: {
          id: 'draft-1',
          organizationId: 'org-1',
          storageObjectId: 'obj-1',
        },
        select: { id: true },
      });
      expect(storageFindFirst).toHaveBeenCalledWith({
        where: { id: 'obj-1', organizationId: 'org-1', key: { not: null } },
      });
      expect(get).toHaveBeenCalledWith('organizations/org-1/uploads/obj-1');
      expect(extract).toHaveBeenCalledWith(
        {
          buffer: Buffer.from('bytes'),
          contentType: 'image/png',
          filename: 'fatura.png',
        },
        { language: 'eng', timeoutMs: 30_000 },
      );
      expect(updateMany).toHaveBeenCalledWith({
        where: {
          id: 'draft-1',
          organizationId: 'org-1',
          storageObjectId: 'obj-1',
        },
        data: {
          ocrText: 'texto extraído',
          ocrConfidence: 91,
        },
      });
    });
  });

  describe('2. payload com organização errada', () => {
    it('não executa OCR, não atualiza o draft, termina sem retry', async () => {
      const draftFindFirst = jest.fn().mockResolvedValue(null);
      const get = jest.fn();
      const extract = jest.fn();
      const updateMany = jest.fn();

      const { providers, getHandler } = buildProcessor({ draftFindFirst, get, extract, updateMany });
      const moduleRef = await Test.createTestingModule({ providers }).compile();
      moduleRef.get(OcrProcessingProcessor).onModuleInit();

      await expect(
        getHandler()!({ ...PAYLOAD, organizationId: 'org-x' }, 'job-1'),
      ).resolves.toBeUndefined();

      expect(get).not.toHaveBeenCalled();
      expect(extract).not.toHaveBeenCalled();
      expect(updateMany).not.toHaveBeenCalled();
    });
  });

  describe('3. invoiceDraftId não corresponde ao storageObjectId', () => {
    it('não executa OCR, não atualiza o draft', async () => {
      // A query filtra pelas três condições em simultâneo — um payload
      // inconsistente também resulta em "não encontrado".
      const draftFindFirst = jest.fn().mockResolvedValue(null);
      const get = jest.fn();
      const extract = jest.fn();
      const updateMany = jest.fn();

      const { providers, getHandler } = buildProcessor({ draftFindFirst, get, extract, updateMany });
      const moduleRef = await Test.createTestingModule({ providers }).compile();
      moduleRef.get(OcrProcessingProcessor).onModuleInit();

      await expect(
        getHandler()!({ ...PAYLOAD, storageObjectId: 'obj-outro' }, 'job-1'),
      ).resolves.toBeUndefined();

      expect(get).not.toHaveBeenCalled();
      expect(extract).not.toHaveBeenCalled();
      expect(updateMany).not.toHaveBeenCalled();
    });
  });

  describe('4. draft inexistente', () => {
    it('regista warning, termina sem erro, não executa OCR', async () => {
      const draftFindFirst = jest.fn().mockResolvedValue(null);
      const extract = jest.fn();
      const warnSpy = jest.spyOn(Logger.prototype, 'warn');

      const { providers, getHandler } = buildProcessor({ draftFindFirst, extract });
      const moduleRef = await Test.createTestingModule({ providers }).compile();
      moduleRef.get(OcrProcessingProcessor).onModuleInit();

      await expect(getHandler()!(PAYLOAD, 'job-1')).resolves.toBeUndefined();

      expect(extract).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('5. draft promovido ou eliminado durante o OCR', () => {
    it('updateMany().count === 0 → regista warning, termina sem retry', async () => {
      const draftFindFirst = jest.fn().mockResolvedValue(VALID_DRAFT);
      const storageFindFirst = jest.fn().mockResolvedValue(VALID_STORAGE_OBJECT);
      const get = jest.fn().mockResolvedValue(Buffer.from('bytes'));
      const extract = jest.fn().mockResolvedValue(OCR_RESULT);
      const updateMany = jest.fn().mockResolvedValue({ count: 0 });

      const { providers, getHandler } = buildProcessor({
        draftFindFirst,
        storageFindFirst,
        get,
        extract,
        updateMany,
      });
      const moduleRef = await Test.createTestingModule({ providers }).compile();
      moduleRef.get(OcrProcessingProcessor).onModuleInit();

      await expect(getHandler()!(PAYLOAD, 'job-1')).resolves.toBeUndefined();

      expect(updateMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('6. StorageObject inexistente', () => {
    it('warning, sem OCR, sem persistência', async () => {
      const draftFindFirst = jest.fn().mockResolvedValue(VALID_DRAFT);
      const storageFindFirst = jest.fn().mockResolvedValue(null);
      const get = jest.fn();
      const extract = jest.fn();
      const updateMany = jest.fn();

      const { providers, getHandler } = buildProcessor({
        draftFindFirst,
        storageFindFirst,
        get,
        extract,
        updateMany,
      });
      const moduleRef = await Test.createTestingModule({ providers }).compile();
      moduleRef.get(OcrProcessingProcessor).onModuleInit();

      await expect(getHandler()!(PAYLOAD, 'job-1')).resolves.toBeUndefined();

      expect(get).not.toHaveBeenCalled();
      expect(extract).not.toHaveBeenCalled();
      expect(updateMany).not.toHaveBeenCalled();
    });
  });

  describe('7. StorageObject sem key', () => {
    it('warning, sem OCR (a query já filtra key: { not: null })', async () => {
      const draftFindFirst = jest.fn().mockResolvedValue(VALID_DRAFT);
      // Um StorageObject sem key nunca é devolvido pela query real
      // (filtro key: { not: null }) — mesmo comportamento observável de
      // "storage não encontrado".
      const storageFindFirst = jest.fn().mockResolvedValue(null);
      const extract = jest.fn();

      const { providers, getHandler } = buildProcessor({ draftFindFirst, storageFindFirst, extract });
      const moduleRef = await Test.createTestingModule({ providers }).compile();
      moduleRef.get(OcrProcessingProcessor).onModuleInit();

      await expect(getHandler()!(PAYLOAD, 'job-1')).resolves.toBeUndefined();

      expect(storageFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ key: { not: null } }) }),
      );
      expect(extract).not.toHaveBeenCalled();
    });
  });

  describe('8. erro do storage', () => {
    it('exceção propagada para retry', async () => {
      const draftFindFirst = jest.fn().mockResolvedValue(VALID_DRAFT);
      const storageFindFirst = jest.fn().mockResolvedValue(VALID_STORAGE_OBJECT);
      const get = jest.fn().mockRejectedValue(new Error('MinIO indisponível'));
      const extract = jest.fn();

      const { providers, getHandler } = buildProcessor({
        draftFindFirst,
        storageFindFirst,
        get,
        extract,
      });
      const moduleRef = await Test.createTestingModule({ providers }).compile();
      moduleRef.get(OcrProcessingProcessor).onModuleInit();

      await expect(getHandler()!(PAYLOAD, 'job-1')).rejects.toThrow('MinIO indisponível');
      expect(extract).not.toHaveBeenCalled();
    });
  });

  describe('9. erro do OCR provider', () => {
    it('exceção propagada para retry', async () => {
      const draftFindFirst = jest.fn().mockResolvedValue(VALID_DRAFT);
      const storageFindFirst = jest.fn().mockResolvedValue(VALID_STORAGE_OBJECT);
      const get = jest.fn().mockResolvedValue(Buffer.from('bytes'));
      const extract = jest.fn().mockRejectedValue(new Error('Falha no provider Tesseract'));
      const updateMany = jest.fn();

      const { providers, getHandler } = buildProcessor({
        draftFindFirst,
        storageFindFirst,
        get,
        extract,
        updateMany,
      });
      const moduleRef = await Test.createTestingModule({ providers }).compile();
      moduleRef.get(OcrProcessingProcessor).onModuleInit();

      await expect(getHandler()!(PAYLOAD, 'job-1')).rejects.toThrow('Falha no provider Tesseract');
      expect(updateMany).not.toHaveBeenCalled();
    });
  });

  describe('10. erro Prisma durante persistência', () => {
    it('exceção propagada para retry', async () => {
      const draftFindFirst = jest.fn().mockResolvedValue(VALID_DRAFT);
      const storageFindFirst = jest.fn().mockResolvedValue(VALID_STORAGE_OBJECT);
      const get = jest.fn().mockResolvedValue(Buffer.from('bytes'));
      const extract = jest.fn().mockResolvedValue(OCR_RESULT);
      const updateMany = jest.fn().mockRejectedValue(new Error('Prisma indisponível'));

      const { providers, getHandler } = buildProcessor({
        draftFindFirst,
        storageFindFirst,
        get,
        extract,
        updateMany,
      });
      const moduleRef = await Test.createTestingModule({ providers }).compile();
      moduleRef.get(OcrProcessingProcessor).onModuleInit();

      await expect(getHandler()!(PAYLOAD, 'job-1')).rejects.toThrow('Prisma indisponível');
    });
  });

  describe('11. reprocessamento', () => {
    it('processar o mesmo job duas vezes só atualiza os mesmos campos, sem criar entidades novas', async () => {
      const draftFindFirst = jest.fn().mockResolvedValue(VALID_DRAFT);
      const storageFindFirst = jest.fn().mockResolvedValue(VALID_STORAGE_OBJECT);
      const get = jest.fn().mockResolvedValue(Buffer.from('bytes'));
      const extract = jest.fn().mockResolvedValue(OCR_RESULT);
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });

      const { providers, getHandler } = buildProcessor({
        draftFindFirst,
        storageFindFirst,
        get,
        extract,
        updateMany,
      });
      const moduleRef = await Test.createTestingModule({ providers }).compile();
      moduleRef.get(OcrProcessingProcessor).onModuleInit();

      await getHandler()!(PAYLOAD, 'job-1');
      await getHandler()!(PAYLOAD, 'job-1-retry');

      expect(updateMany).toHaveBeenCalledTimes(2);
      expect(updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: 'draft-1', organizationId: 'org-1', storageObjectId: 'obj-1' },
        data: { ocrText: 'texto extraído', ocrConfidence: 91 },
      });
      expect(updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: 'draft-1', organizationId: 'org-1', storageObjectId: 'obj-1' },
        data: { ocrText: 'texto extraído', ocrConfidence: 91 },
      });
      // O mock de PrismaService neste teste não expõe nenhum método
      // `create` para invoiceDraft/invoiceAttachment/invoice — não há
      // forma de o processor criar novas entidades mesmo que tentasse.
    });
  });

  describe('12. configuração OCR (OCR_LANGUAGE/OCR_TIMEOUT_MS)', () => {
    const originalLanguage = process.env.OCR_LANGUAGE;
    const originalTimeout = process.env.OCR_TIMEOUT_MS;

    afterEach(() => {
      if (originalLanguage === undefined) delete process.env.OCR_LANGUAGE;
      else process.env.OCR_LANGUAGE = originalLanguage;
      if (originalTimeout === undefined) delete process.env.OCR_TIMEOUT_MS;
      else process.env.OCR_TIMEOUT_MS = originalTimeout;
    });

    it('lê OCR_LANGUAGE/OCR_TIMEOUT_MS do ambiente e passa-os a OCRService.extract()', async () => {
      process.env.OCR_LANGUAGE = 'por';
      process.env.OCR_TIMEOUT_MS = '15000';

      const draftFindFirst = jest.fn().mockResolvedValue(VALID_DRAFT);
      const storageFindFirst = jest.fn().mockResolvedValue(VALID_STORAGE_OBJECT);
      const get = jest.fn().mockResolvedValue(Buffer.from('bytes'));
      const extract = jest.fn().mockResolvedValue(OCR_RESULT);
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });

      const { providers, getHandler } = buildProcessor({
        draftFindFirst,
        storageFindFirst,
        get,
        extract,
        updateMany,
      });
      const moduleRef = await Test.createTestingModule({ providers }).compile();
      moduleRef.get(OcrProcessingProcessor).onModuleInit();

      await getHandler()!(PAYLOAD, 'job-1');

      expect(extract).toHaveBeenCalledWith(expect.anything(), {
        language: 'por',
        timeoutMs: 15000,
      });
    });
  });
});
