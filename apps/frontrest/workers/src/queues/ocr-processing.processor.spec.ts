import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import type { JobAttemptInfo, JobHandler, OcrProcessingJob } from '@frontcore/queue';
import { OCR_PROCESSING_QUEUE } from '@frontcore/queue';
import { PrismaService } from '@frontcore/database';
import {
  OCRProviderError,
  OCRService,
  OCRTimeoutError,
  PdfInvalidError,
  PdfProtectedError,
  PdfPageLimitExceededError,
  PdfRasterizationTimeoutError,
  PdfRasterizerError,
} from '@frontcore/ocr';
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

  const DRAFT_WHERE = { id: 'draft-1', organizationId: 'org-1', storageObjectId: 'obj-1' };

  // 1ª de 3 tentativas — usado por omissão em todos os testes que não
  // estão especificamente a exercitar o limite de tentativas.
  const FIRST_ATTEMPT: JobAttemptInfo = { attemptNumber: 1, maxAttempts: 3 };
  const LAST_ATTEMPT: JobAttemptInfo = { attemptNumber: 3, maxAttempts: 3 };

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
              updateMany: overrides.updateMany ?? jest.fn().mockResolvedValue({ count: 1 }),
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

  async function run(
    overrides: Parameters<typeof buildProcessor>[0],
    attempt: JobAttemptInfo = FIRST_ATTEMPT,
    jobId = 'job-1',
  ) {
    const built = buildProcessor(overrides);
    const moduleRef = await Test.createTestingModule({ providers: built.providers }).compile();
    moduleRef.get(OcrProcessingProcessor).onModuleInit();
    const handlerPromise = built.getHandler()!(PAYLOAD, jobId, attempt);
    return { ...built, handlerPromise };
  }

  it('regista um consumidor para a fila ocr-processing ao iniciar o módulo', async () => {
    const { consumeMock, providers } = buildProcessor({});
    const moduleRef = await Test.createTestingModule({ providers }).compile();

    moduleRef.get(OcrProcessingProcessor).onModuleInit();

    expect(consumeMock).toHaveBeenCalledWith(OCR_PROCESSING_QUEUE, expect.any(Function));
  });

  describe('1. job válido', () => {
    it('marca PROCESSING, extrai e persiste ocrText/ocrConfidence/ocrStatus COMPLETED', async () => {
      const draftFindFirst = jest.fn().mockResolvedValue(VALID_DRAFT);
      const storageFindFirst = jest.fn().mockResolvedValue(VALID_STORAGE_OBJECT);
      const get = jest.fn().mockResolvedValue(Buffer.from('bytes'));
      const extract = jest.fn().mockResolvedValue(OCR_RESULT);
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });

      const { handlerPromise } = await run({
        draftFindFirst,
        storageFindFirst,
        get,
        extract,
        updateMany,
      });
      await handlerPromise;

      expect(draftFindFirst).toHaveBeenCalledWith({
        where: DRAFT_WHERE,
        select: { id: true },
      });
      expect(storageFindFirst).toHaveBeenCalledWith({
        where: { id: 'obj-1', organizationId: 'org-1', key: { not: null } },
      });
      expect(updateMany).toHaveBeenCalledTimes(2);
      expect(updateMany).toHaveBeenNthCalledWith(1, {
        where: DRAFT_WHERE,
        data: { ocrStatus: 'PROCESSING' },
      });
      expect(get).toHaveBeenCalledWith('organizations/org-1/uploads/obj-1');
      expect(extract).toHaveBeenCalledWith(
        {
          buffer: Buffer.from('bytes'),
          contentType: 'image/png',
          filename: 'fatura.png',
        },
        { language: 'por', timeoutMs: 30_000 },
      );
      expect(updateMany).toHaveBeenNthCalledWith(2, {
        where: DRAFT_WHERE,
        data: {
          ocrText: 'texto extraído',
          ocrConfidence: 91,
          ocrStatus: 'COMPLETED',
          ocrError: null,
        },
      });
    });
  });

  describe('2. payload com organização errada', () => {
    it('não marca PROCESSING, não executa OCR, termina sem retry', async () => {
      const draftFindFirst = jest.fn().mockResolvedValue(null);
      const get = jest.fn();
      const extract = jest.fn();
      const updateMany = jest.fn();

      const built = buildProcessor({ draftFindFirst, get, extract, updateMany });
      const moduleRef = await Test.createTestingModule({ providers: built.providers }).compile();
      moduleRef.get(OcrProcessingProcessor).onModuleInit();

      await expect(
        built.getHandler()!({ ...PAYLOAD, organizationId: 'org-x' }, 'job-1', FIRST_ATTEMPT),
      ).resolves.toBeUndefined();

      expect(updateMany).not.toHaveBeenCalled();
      expect(get).not.toHaveBeenCalled();
      expect(extract).not.toHaveBeenCalled();
    });
  });

  describe('3. invoiceDraftId não corresponde ao storageObjectId', () => {
    it('não marca PROCESSING, não executa OCR', async () => {
      const draftFindFirst = jest.fn().mockResolvedValue(null);
      const get = jest.fn();
      const extract = jest.fn();
      const updateMany = jest.fn();

      const built = buildProcessor({ draftFindFirst, get, extract, updateMany });
      const moduleRef = await Test.createTestingModule({ providers: built.providers }).compile();
      moduleRef.get(OcrProcessingProcessor).onModuleInit();

      await expect(
        built.getHandler()!({ ...PAYLOAD, storageObjectId: 'obj-outro' }, 'job-1', FIRST_ATTEMPT),
      ).resolves.toBeUndefined();

      expect(updateMany).not.toHaveBeenCalled();
      expect(get).not.toHaveBeenCalled();
      expect(extract).not.toHaveBeenCalled();
    });
  });

  describe('4. draft inexistente', () => {
    it('regista warning, termina sem erro, não executa OCR', async () => {
      const draftFindFirst = jest.fn().mockResolvedValue(null);
      const extract = jest.fn();
      const warnSpy = jest.spyOn(Logger.prototype, 'warn');

      const { handlerPromise } = await run({ draftFindFirst, extract });

      await expect(handlerPromise).resolves.toBeUndefined();
      expect(extract).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('5. draft promovido ou eliminado durante o OCR (após COMPLETED)', () => {
    it('claim de PROCESSING sucede, escrita final count === 0 → warning, termina sem retry', async () => {
      const draftFindFirst = jest.fn().mockResolvedValue(VALID_DRAFT);
      const storageFindFirst = jest.fn().mockResolvedValue(VALID_STORAGE_OBJECT);
      const get = jest.fn().mockResolvedValue(Buffer.from('bytes'));
      const extract = jest.fn().mockResolvedValue(OCR_RESULT);
      const updateMany = jest
        .fn()
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      const { handlerPromise } = await run({
        draftFindFirst,
        storageFindFirst,
        get,
        extract,
        updateMany,
      });

      await expect(handlerPromise).resolves.toBeUndefined();
      expect(updateMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('5b. draft promovido ou eliminado entre a validação e o início do OCR', () => {
    it('claim de PROCESSING com count === 0 → warning, termina sem retry, nunca chega a extract()', async () => {
      const draftFindFirst = jest.fn().mockResolvedValue(VALID_DRAFT);
      const storageFindFirst = jest.fn().mockResolvedValue(VALID_STORAGE_OBJECT);
      const get = jest.fn();
      const extract = jest.fn();
      const updateMany = jest.fn().mockResolvedValue({ count: 0 });

      const { handlerPromise } = await run({
        draftFindFirst,
        storageFindFirst,
        get,
        extract,
        updateMany,
      });

      await expect(handlerPromise).resolves.toBeUndefined();
      expect(updateMany).toHaveBeenCalledTimes(1);
      expect(get).not.toHaveBeenCalled();
      expect(extract).not.toHaveBeenCalled();
    });
  });

  describe('6. StorageObject inexistente', () => {
    it('warning, sem OCR, sem marcação de estado', async () => {
      const draftFindFirst = jest.fn().mockResolvedValue(VALID_DRAFT);
      const storageFindFirst = jest.fn().mockResolvedValue(null);
      const get = jest.fn();
      const extract = jest.fn();
      const updateMany = jest.fn();

      const { handlerPromise } = await run({
        draftFindFirst,
        storageFindFirst,
        get,
        extract,
        updateMany,
      });

      await expect(handlerPromise).resolves.toBeUndefined();
      expect(updateMany).not.toHaveBeenCalled();
      expect(get).not.toHaveBeenCalled();
      expect(extract).not.toHaveBeenCalled();
    });
  });

  describe('7. StorageObject sem key', () => {
    it('warning, sem OCR (a query já filtra key: { not: null })', async () => {
      const draftFindFirst = jest.fn().mockResolvedValue(VALID_DRAFT);
      const storageFindFirst = jest.fn().mockResolvedValue(null);
      const extract = jest.fn();

      const { handlerPromise } = await run({ draftFindFirst, storageFindFirst, extract });

      await expect(handlerPromise).resolves.toBeUndefined();
      expect(storageFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ key: { not: null } }) }),
      );
      expect(extract).not.toHaveBeenCalled();
    });
  });

  describe('8. erro do storage (tentativa 1 de 3 — falha temporária)', () => {
    it('marca ocrStatus PENDING e propaga a exceção para retry', async () => {
      const draftFindFirst = jest.fn().mockResolvedValue(VALID_DRAFT);
      const storageFindFirst = jest.fn().mockResolvedValue(VALID_STORAGE_OBJECT);
      const get = jest.fn().mockRejectedValue(new Error('MinIO indisponível'));
      const extract = jest.fn();
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });

      const { handlerPromise } = await run(
        { draftFindFirst, storageFindFirst, get, extract, updateMany },
        FIRST_ATTEMPT,
      );

      await expect(handlerPromise).rejects.toThrow('MinIO indisponível');
      expect(extract).not.toHaveBeenCalled();
      expect(updateMany).toHaveBeenCalledTimes(2);
      expect(updateMany).toHaveBeenNthCalledWith(2, {
        where: DRAFT_WHERE,
        data: { ocrStatus: 'PENDING' },
      });
    });
  });

  describe('9. erro do OCR provider (tentativa 1 de 3 — falha temporária)', () => {
    it('marca ocrStatus PENDING e propaga a exceção para retry', async () => {
      const draftFindFirst = jest.fn().mockResolvedValue(VALID_DRAFT);
      const storageFindFirst = jest.fn().mockResolvedValue(VALID_STORAGE_OBJECT);
      const get = jest.fn().mockResolvedValue(Buffer.from('bytes'));
      const extract = jest.fn().mockRejectedValue(new Error('Falha no provider Tesseract'));
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });

      const { handlerPromise } = await run(
        { draftFindFirst, storageFindFirst, get, extract, updateMany },
        FIRST_ATTEMPT,
      );

      await expect(handlerPromise).rejects.toThrow('Falha no provider Tesseract');
      expect(updateMany).toHaveBeenCalledTimes(2);
      expect(updateMany).toHaveBeenNthCalledWith(2, {
        where: DRAFT_WHERE,
        data: { ocrStatus: 'PENDING' },
      });
    });
  });

  describe('10. erro Prisma durante persistência', () => {
    it('propaga a exceção original para retry, mesmo que a marcação de estado subsequente também falhe', async () => {
      const draftFindFirst = jest.fn().mockResolvedValue(VALID_DRAFT);
      const storageFindFirst = jest.fn().mockResolvedValue(VALID_STORAGE_OBJECT);
      const get = jest.fn().mockResolvedValue(Buffer.from('bytes'));
      const extract = jest.fn().mockResolvedValue(OCR_RESULT);
      const updateMany = jest
        .fn()
        .mockResolvedValueOnce({ count: 1 }) // claim PROCESSING
        .mockRejectedValueOnce(new Error('Prisma indisponível')); // escrita COMPLETED falha

      const { handlerPromise } = await run(
        { draftFindFirst, storageFindFirst, get, extract, updateMany },
        FIRST_ATTEMPT,
      );

      await expect(handlerPromise).rejects.toThrow('Prisma indisponível');
    });
  });

  // Idempotência aqui é dos efeitos persistidos (nunca cria entidades,
  // repetir a escrita converge sempre no mesmo resultado) — as duas
  // invocações abaixo são sequenciais (await uma de cada vez), não
  // simulam execução concorrente real do provider OCR. Ver "7.
  // Idempotência é dos efeitos persistidos, não da execução do OCR" em
  // docs/phases/phase-6.5-ocr-retry-recovery-foundation.md.
  describe('11. reprocessamento (idempotência)', () => {
    it('processar o mesmo job duas vezes só atualiza os mesmos campos, sem criar entidades novas', async () => {
      const draftFindFirst = jest.fn().mockResolvedValue(VALID_DRAFT);
      const storageFindFirst = jest.fn().mockResolvedValue(VALID_STORAGE_OBJECT);
      const get = jest.fn().mockResolvedValue(Buffer.from('bytes'));
      const extract = jest.fn().mockResolvedValue(OCR_RESULT);
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });

      const built = buildProcessor({ draftFindFirst, storageFindFirst, get, extract, updateMany });
      const moduleRef = await Test.createTestingModule({ providers: built.providers }).compile();
      moduleRef.get(OcrProcessingProcessor).onModuleInit();

      await built.getHandler()!(PAYLOAD, 'job-1', FIRST_ATTEMPT);
      await built.getHandler()!(PAYLOAD, 'job-1-retry', { attemptNumber: 2, maxAttempts: 3 });

      // 2 chamadas por execução (PROCESSING + COMPLETED) × 2 execuções.
      expect(updateMany).toHaveBeenCalledTimes(4);
      expect(updateMany).toHaveBeenNthCalledWith(2, {
        where: DRAFT_WHERE,
        data: { ocrText: 'texto extraído', ocrConfidence: 91, ocrStatus: 'COMPLETED', ocrError: null },
      });
      expect(updateMany).toHaveBeenNthCalledWith(4, {
        where: DRAFT_WHERE,
        data: { ocrText: 'texto extraído', ocrConfidence: 91, ocrStatus: 'COMPLETED', ocrError: null },
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

      const { handlerPromise } = await run({
        draftFindFirst,
        storageFindFirst,
        get,
        extract,
        updateMany,
      });
      await handlerPromise;

      expect(extract).toHaveBeenCalledWith(expect.anything(), {
        language: 'por',
        timeoutMs: 15000,
      });
    });
  });

  describe('13. Retry & Recovery (Fase 6.5)', () => {
    it('início do processamento regista a tentativa atual e o máximo configurado', async () => {
      const draftFindFirst = jest.fn().mockResolvedValue(VALID_DRAFT);
      const storageFindFirst = jest.fn().mockResolvedValue(VALID_STORAGE_OBJECT);
      const get = jest.fn().mockResolvedValue(Buffer.from('bytes'));
      const extract = jest.fn().mockResolvedValue(OCR_RESULT);
      const logSpy = jest.spyOn(Logger.prototype, 'log');

      const { handlerPromise } = await run(
        { draftFindFirst, storageFindFirst, get, extract },
        { attemptNumber: 2, maxAttempts: 3 },
      );
      await handlerPromise;

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('tentativa 2/3'));
      logSpy.mockRestore();
    });

    // Prova ausência de loop interno numa única invocação do handler —
    // não prova (nem pode provar, a este nível de mock) ausência de
    // sobreposição entre invocações separadas: em timeout real, o
    // provider abandonado continua a correr em segundo plano
    // (withTimeout() não cancela, packages/ocr/src/utils/with-timeout.ts)
    // e pode ainda estar a terminar quando o próximo retry começa. Ver
    // "7. Idempotência é dos efeitos persistidos, não da execução do
    // OCR" em docs/phases/phase-6.5-ocr-retry-recovery-foundation.md.
    it('retry automático: não reimplementa nenhuma lógica de atraso/loop — falha e devolve o controlo ao BullMQ numa só chamada a extract()', async () => {
      const draftFindFirst = jest.fn().mockResolvedValue(VALID_DRAFT);
      const storageFindFirst = jest.fn().mockResolvedValue(VALID_STORAGE_OBJECT);
      const get = jest.fn().mockResolvedValue(Buffer.from('bytes'));
      const extract = jest.fn().mockRejectedValue(new OCRTimeoutError('excedeu o limite'));

      const { handlerPromise } = await run(
        { draftFindFirst, storageFindFirst, get, extract },
        FIRST_ATTEMPT,
      );

      await expect(handlerPromise).rejects.toThrow('excedeu o limite');
      expect(extract).toHaveBeenCalledTimes(1);
    });

    it('falha na última tentativa (3 de 3) marca ocrStatus FAILED com mensagem sanitizada — nunca a mensagem bruta do erro', async () => {
      const draftFindFirst = jest.fn().mockResolvedValue(VALID_DRAFT);
      const storageFindFirst = jest.fn().mockResolvedValue(VALID_STORAGE_OBJECT);
      const get = jest.fn().mockResolvedValue(Buffer.from('bytes'));
      const extract = jest
        .fn()
        .mockRejectedValue(new Error('ECONNREFUSED 10.0.0.5:6379 password=super-secreto'));
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });

      const { handlerPromise } = await run(
        { draftFindFirst, storageFindFirst, get, extract, updateMany },
        LAST_ATTEMPT,
      );

      await expect(handlerPromise).rejects.toThrow('ECONNREFUSED');
      expect(updateMany).toHaveBeenNthCalledWith(2, {
        where: DRAFT_WHERE,
        data: { ocrStatus: 'FAILED', ocrError: expect.any(String) },
      });
      const [, secondCallArgs] = updateMany.mock.calls;
      const persistedError = (secondCallArgs[0] as { data: { ocrError: string } }).data.ocrError;
      expect(persistedError).not.toMatch(/10\.0\.0\.5|6379|password|super-secreto/);
    });

    it('classifica OCRTimeoutError como mensagem de timeout sanitizada em ocrError', async () => {
      const draftFindFirst = jest.fn().mockResolvedValue(VALID_DRAFT);
      const storageFindFirst = jest.fn().mockResolvedValue(VALID_STORAGE_OBJECT);
      const get = jest.fn().mockResolvedValue(Buffer.from('bytes'));
      const extract = jest.fn().mockRejectedValue(new OCRTimeoutError('excedeu 30000ms'));
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });

      const { handlerPromise } = await run(
        { draftFindFirst, storageFindFirst, get, extract, updateMany },
        LAST_ATTEMPT,
      );

      await expect(handlerPromise).rejects.toThrow(OCRTimeoutError);
      expect(updateMany).toHaveBeenNthCalledWith(2, {
        where: DRAFT_WHERE,
        data: { ocrStatus: 'FAILED', ocrError: 'Tempo limite excedido durante o processamento OCR.' },
      });
    });

    it('classifica OCRProviderError como falha do motor de OCR em ocrError', async () => {
      const draftFindFirst = jest.fn().mockResolvedValue(VALID_DRAFT);
      const storageFindFirst = jest.fn().mockResolvedValue(VALID_STORAGE_OBJECT);
      const get = jest.fn().mockResolvedValue(Buffer.from('bytes'));
      const extract = jest.fn().mockRejectedValue(new OCRProviderError('engine crashed'));
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });

      const { handlerPromise } = await run(
        { draftFindFirst, storageFindFirst, get, extract, updateMany },
        LAST_ATTEMPT,
      );

      await expect(handlerPromise).rejects.toThrow(OCRProviderError);
      expect(updateMany).toHaveBeenNthCalledWith(2, {
        where: DRAFT_WHERE,
        data: { ocrStatus: 'FAILED', ocrError: 'Falha no motor de OCR.' },
      });
    });

    it.each([
      [
        'PdfInvalidError',
        PdfInvalidError,
        new PdfInvalidError('detalhe interno do poppler'),
        'Documento PDF inválido, corrompido ou protegido.',
      ],
      [
        'PdfProtectedError',
        PdfProtectedError,
        new PdfProtectedError('Incorrect password: /tmp/xyz/input.pdf'),
        'Documento PDF inválido, corrompido ou protegido.',
      ],
      [
        'PdfPageLimitExceededError',
        PdfPageLimitExceededError,
        new PdfPageLimitExceededError('15 páginas, acima do limite de 10'),
        'Documento PDF excede os limites de processamento.',
      ],
      [
        'PdfRasterizationTimeoutError',
        PdfRasterizationTimeoutError,
        new PdfRasterizationTimeoutError('pdftoppm excedeu 30000ms'),
        'Tempo limite excedido durante a preparação do documento.',
      ],
      [
        'PdfRasterizerError',
        PdfRasterizerError,
        new PdfRasterizerError('spawn pdfinfo ENOENT: /tmp/xyz/input.pdf'),
        'Falha ao preparar o documento para OCR.',
      ],
    ])('classifica %s como mensagem sanitizada em ocrError — nunca a mensagem bruta', async (_name, errorClass, error, expectedMessage) => {
      const draftFindFirst = jest.fn().mockResolvedValue(VALID_DRAFT);
      const storageFindFirst = jest.fn().mockResolvedValue(VALID_STORAGE_OBJECT);
      const get = jest.fn().mockResolvedValue(Buffer.from('bytes'));
      const extract = jest.fn().mockRejectedValue(error);
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });

      const { handlerPromise } = await run(
        { draftFindFirst, storageFindFirst, get, extract, updateMany },
        LAST_ATTEMPT,
      );

      await expect(handlerPromise).rejects.toThrow(errorClass);
      expect(updateMany).toHaveBeenNthCalledWith(2, {
        where: DRAFT_WHERE,
        data: { ocrStatus: 'FAILED', ocrError: expectedMessage },
      });
      // Nunca o path/comando/stderr que a mensagem original podia conter.
      expect(updateMany.mock.calls[1][0].data.ocrError).not.toMatch(/tmp|poppler|ENOENT|password:/i);
    });

    it('falha permanente é registada em log claro (nível error) com o número máximo de tentativas', async () => {
      const draftFindFirst = jest.fn().mockResolvedValue(VALID_DRAFT);
      const storageFindFirst = jest.fn().mockResolvedValue(VALID_STORAGE_OBJECT);
      const get = jest.fn().mockResolvedValue(Buffer.from('bytes'));
      const extract = jest.fn().mockRejectedValue(new Error('falha definitiva'));
      const errorSpy = jest.spyOn(Logger.prototype, 'error');

      const { handlerPromise } = await run(
        { draftFindFirst, storageFindFirst, get, extract },
        LAST_ATTEMPT,
      );

      await expect(handlerPromise).rejects.toThrow('falha definitiva');
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('falha permanente após 3 tentativa(s)'),
        expect.anything(),
      );
      errorSpy.mockRestore();
    });

    it('uma falha adicional ao marcar o estado (Prisma indisponível) não mascara o erro técnico original', async () => {
      const draftFindFirst = jest.fn().mockResolvedValue(VALID_DRAFT);
      const storageFindFirst = jest.fn().mockResolvedValue(VALID_STORAGE_OBJECT);
      const get = jest.fn().mockRejectedValue(new Error('MinIO indisponível'));
      const extract = jest.fn();
      const updateMany = jest
        .fn()
        .mockResolvedValueOnce({ count: 1 }) // claim PROCESSING
        .mockRejectedValueOnce(new Error('Prisma também indisponível')); // marcação de PENDING falha

      const { handlerPromise } = await run(
        { draftFindFirst, storageFindFirst, get, extract, updateMany },
        FIRST_ATTEMPT,
      );

      await expect(handlerPromise).rejects.toThrow('MinIO indisponível');
    });

    it('não persiste nada no Invoice — o mock de PrismaService não expõe invoice.create/update', async () => {
      const draftFindFirst = jest.fn().mockResolvedValue(VALID_DRAFT);
      const storageFindFirst = jest.fn().mockResolvedValue(VALID_STORAGE_OBJECT);
      const get = jest.fn().mockResolvedValue(Buffer.from('bytes'));
      const extract = jest.fn().mockResolvedValue(OCR_RESULT);

      const { handlerPromise } = await run(
        { draftFindFirst, storageFindFirst, get, extract },
        LAST_ATTEMPT,
      );

      await expect(handlerPromise).resolves.toBeUndefined();
      // Nenhum provider de `invoice`/`invoiceAttachment` foi sequer
      // registado no módulo de teste — a promoção continua exclusiva da
      // API (InvoiceDraftsService.promote()), inalterada nesta fase.
    });
  });
});
