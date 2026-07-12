import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OCR_PROCESSING_QUEUE } from '@frontcore/queue';
import { InvoiceDraftsService } from './invoice-drafts.service';
import { FiscalParsingService } from '../../fiscal-parsing/fiscal-parsing.service';
import {
  SupplierExtractor,
  CustomerExtractor,
  InvoiceNumberExtractor,
  InvoiceDateExtractor,
  DueDateExtractor,
  CurrencyExtractor,
  TotalsExtractor,
  VatExtractor,
  TaxNumberExtractor,
} from '../../fiscal-parsing/extractors';
import { createMockPrismaService } from '../../../test/utils/mock-prisma';
import type { MockPrismaService } from '../../../test/utils/mock-prisma';

// Instância real (não mock) — FiscalParsingService é puro/síncrono, sem
// dependências de infraestrutura; instanciar os extractors reais é mais
// simples e mais fiel do que mockar o pipeline inteiro.
function createRealFiscalParsingService(): FiscalParsingService {
  return new FiscalParsingService([
    new SupplierExtractor(),
    new CustomerExtractor(),
    new InvoiceNumberExtractor(),
    new InvoiceDateExtractor(),
    new DueDateExtractor(),
    new CurrencyExtractor(),
    new TotalsExtractor(),
    new VatExtractor(),
    new TaxNumberExtractor(),
  ]);
}

function createMockQueueProducer() {
  return {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    close: jest.fn(),
  };
}
type MockQueueProducer = ReturnType<typeof createMockQueueProducer>;

describe('InvoiceDraftsService', () => {
  let service: InvoiceDraftsService;
  let prisma: MockPrismaService;
  let queueProducer: MockQueueProducer;

  beforeEach(() => {
    prisma = createMockPrismaService();
    queueProducer = createMockQueueProducer();
    service = new InvoiceDraftsService(
      prisma as never,
      queueProducer as never,
      createRealFiscalParsingService(),
    );
    // Por omissão, o StorageObject existe, pertence à organização e está
    // livre — os testes que querem o caso contrário sobrescrevem.
    prisma.storageObject.findFirst.mockResolvedValue({ id: 'obj-1', organizationId: 'org-1' });
    prisma.invoiceDraft.findFirst.mockResolvedValue(null);
    prisma.invoiceAttachment.findFirst.mockResolvedValue(null);
    prisma.supplier.findFirst.mockResolvedValue({ id: 'sup-1', organizationId: 'org-1' });
    prisma.expenseCategory.findFirst.mockResolvedValue({ id: 'cat-1', organizationId: 'org-1' });
  });

  describe('create', () => {
    it('1. cria draft com StorageObject válido da organização', async () => {
      prisma.invoiceDraft.create.mockResolvedValue({ id: 'draft-1' });

      await service.create('org-1', { storageObjectId: 'obj-1' });

      expect(prisma.invoiceDraft.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ organizationId: 'org-1', storageObjectId: 'obj-1' }),
        }),
      );
    });

    it('2. rejeita StorageObject inexistente', async () => {
      prisma.storageObject.findFirst.mockResolvedValue(null);

      await expect(
        service.create('org-1', { storageObjectId: 'obj-x' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.invoiceDraft.create).not.toHaveBeenCalled();
    });

    it('3. rejeita StorageObject de outra organização', async () => {
      // O filtro organizationId já faz parte da query — para outra
      // organização, o Prisma real devolveria null.
      prisma.storageObject.findFirst.mockResolvedValue(null);

      await expect(
        service.create('org-1', { storageObjectId: 'obj-de-outra-org' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.storageObject.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-1' }),
        }),
      );
    });

    it('4. rejeita StorageObject sem key válida', async () => {
      // key: { not: null } faz parte do filtro — um objeto pendente
      // (key ainda nula) também resulta em null.
      prisma.storageObject.findFirst.mockResolvedValue(null);

      await expect(
        service.create('org-1', { storageObjectId: 'obj-pendente' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.storageObject.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ key: { not: null } }),
        }),
      );
    });

    it('5. rejeita StorageObject já associado a InvoiceDraft', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue({ id: 'draft-existente' });

      await expect(
        service.create('org-1', { storageObjectId: 'obj-1' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.invoiceDraft.create).not.toHaveBeenCalled();
    });

    it('6. rejeita StorageObject já associado a InvoiceAttachment', async () => {
      prisma.invoiceAttachment.findFirst.mockResolvedValue({ id: 'att-existente' });

      await expect(
        service.create('org-1', { storageObjectId: 'obj-1' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.invoiceDraft.create).not.toHaveBeenCalled();
    });

    it('7. valida Supplier da organização quando fornecido', async () => {
      prisma.invoiceDraft.create.mockResolvedValue({ id: 'draft-1' });

      await service.create('org-1', { storageObjectId: 'obj-1', supplierId: 'sup-1' });

      expect(prisma.supplier.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'sup-1', organizationId: 'org-1' } }),
      );
      expect(prisma.invoiceDraft.create).toHaveBeenCalled();
    });

    it('8. rejeita Supplier de outra organização', async () => {
      prisma.supplier.findFirst.mockResolvedValue(null);

      await expect(
        service.create('org-1', { storageObjectId: 'obj-1', supplierId: 'sup-x' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.invoiceDraft.create).not.toHaveBeenCalled();
    });

    it('9. valida ExpenseCategory da organização quando fornecida', async () => {
      prisma.invoiceDraft.create.mockResolvedValue({ id: 'draft-1' });

      await service.create('org-1', { storageObjectId: 'obj-1', categoryId: 'cat-1' });

      expect(prisma.expenseCategory.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'cat-1', organizationId: 'org-1' } }),
      );
    });

    it('rejeita ExpenseCategory de outra organização', async () => {
      prisma.expenseCategory.findFirst.mockResolvedValue(null);

      await expect(
        service.create('org-1', { storageObjectId: 'obj-1', categoryId: 'cat-x' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.invoiceDraft.create).not.toHaveBeenCalled();
    });
  });

  describe('create — publicação do job OCR (Fase 6.4)', () => {
    it('1. criação válida publica um job OCR', async () => {
      prisma.invoiceDraft.create.mockResolvedValue({
        id: 'draft-1',
        storageObjectId: 'obj-1',
      });

      await service.create('org-1', { storageObjectId: 'obj-1' });

      expect(queueProducer.add).toHaveBeenCalledTimes(1);
    });

    it('2. payload contém invoiceDraftId, storageObjectId e organizationId', async () => {
      prisma.invoiceDraft.create.mockResolvedValue({
        id: 'draft-1',
        storageObjectId: 'obj-1',
      });

      await service.create('org-1', { storageObjectId: 'obj-1' });

      expect(queueProducer.add).toHaveBeenCalledWith(
        expect.any(String),
        {
          invoiceDraftId: 'draft-1',
          storageObjectId: 'obj-1',
          organizationId: 'org-1',
        },
        expect.any(Object),
      );
    });

    it('3. usa o nome de fila partilhado OCR_PROCESSING_QUEUE', async () => {
      prisma.invoiceDraft.create.mockResolvedValue({
        id: 'draft-1',
        storageObjectId: 'obj-1',
      });

      await service.create('org-1', { storageObjectId: 'obj-1' });

      expect(queueProducer.add).toHaveBeenCalledWith(
        OCR_PROCESSING_QUEUE,
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('4. usa um jobId determinístico derivado do id do draft', async () => {
      prisma.invoiceDraft.create.mockResolvedValue({
        id: 'draft-1',
        storageObjectId: 'obj-1',
      });

      await service.create('org-1', { storageObjectId: 'obj-1' });

      expect(queueProducer.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ jobId: 'invoice-draft-ocr-draft-1' }),
      );
    });

    it('4b. o jobId nunca contém ":" — o BullMQ rejeita custom ids com esse caráter (bug real encontrado na validação Docker desta fase)', async () => {
      prisma.invoiceDraft.create.mockResolvedValue({
        id: 'draft-1',
        storageObjectId: 'obj-1',
      });

      await service.create('org-1', { storageObjectId: 'obj-1' });

      const [, , options] = queueProducer.add.mock.calls[0] as [unknown, unknown, { jobId: string }];
      expect(options.jobId).not.toMatch(/:/);
    });

    it('5. configura um número explícito de tentativas', async () => {
      prisma.invoiceDraft.create.mockResolvedValue({
        id: 'draft-1',
        storageObjectId: 'obj-1',
      });

      await service.create('org-1', { storageObjectId: 'obj-1' });

      expect(queueProducer.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ attempts: 3 }),
      );
    });

    it('5b. configura backoff exponencial (Fase 6.5) — nunca retry imediato em loop', async () => {
      prisma.invoiceDraft.create.mockResolvedValue({
        id: 'draft-1',
        storageObjectId: 'obj-1',
      });

      await service.create('org-1', { storageObjectId: 'obj-1' });

      expect(queueProducer.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ backoff: { type: 'exponential', delayMs: 5000 } }),
      );
    });

    it('6. o job só é publicado depois de o draft ser criado (usa o id devolvido pelo create)', async () => {
      const callOrder: string[] = [];
      prisma.invoiceDraft.create.mockImplementation(async () => {
        callOrder.push('prisma.invoiceDraft.create');
        return { id: 'draft-gerado', storageObjectId: 'obj-1' };
      });
      queueProducer.add.mockImplementation(async () => {
        callOrder.push('queueProducer.add');
        return { id: 'job-1' };
      });

      await service.create('org-1', { storageObjectId: 'obj-1' });

      expect(callOrder).toEqual(['prisma.invoiceDraft.create', 'queueProducer.add']);
      expect(queueProducer.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ invoiceDraftId: 'draft-gerado' }),
        expect.any(Object),
      );
    });

    it('7. se a criação do draft falhar, nenhum job é publicado', async () => {
      prisma.invoiceDraft.create.mockRejectedValue(new Error('falha na BD'));

      await expect(
        service.create('org-1', { storageObjectId: 'obj-1' }),
      ).rejects.toThrow('falha na BD');
      expect(queueProducer.add).not.toHaveBeenCalled();
    });

    it('8. se a publicação falhar, o erro é propagado e o draft não é apagado', async () => {
      prisma.invoiceDraft.create.mockResolvedValue({
        id: 'draft-1',
        storageObjectId: 'obj-1',
      });
      queueProducer.add.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:6379'));

      await expect(
        service.create('org-1', { storageObjectId: 'obj-1' }),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(prisma.invoiceDraft.delete).not.toHaveBeenCalled();
    });

    it('8b. a mensagem de erro ao cliente não expõe detalhes internos do Redis', async () => {
      prisma.invoiceDraft.create.mockResolvedValue({
        id: 'draft-1',
        storageObjectId: 'obj-1',
      });
      queueProducer.add.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:6379'));

      await expect(
        service.create('org-1', { storageObjectId: 'obj-1' }),
      ).rejects.toThrow(/agendar o processamento OCR/);
    });

    it('9. o payload do job respeita a organização do pedido (isolamento)', async () => {
      prisma.invoiceDraft.create.mockResolvedValue({
        id: 'draft-org-2',
        storageObjectId: 'obj-2',
      });

      await service.create('org-2', { storageObjectId: 'obj-2' });

      expect(queueProducer.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ organizationId: 'org-2' }),
        expect.any(Object),
      );
    });
  });

  describe('findAll', () => {
    it('10. lista apenas drafts da organização', async () => {
      prisma.invoiceDraft.findMany.mockResolvedValue([]);
      prisma.invoiceDraft.count.mockResolvedValue(0);

      await service.findAll('org-1', {});

      expect(prisma.invoiceDraft.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' } }),
      );
    });

    it('filtra por supplierId quando fornecido', async () => {
      prisma.invoiceDraft.findMany.mockResolvedValue([]);
      prisma.invoiceDraft.count.mockResolvedValue(0);

      await service.findAll('org-1', { supplierId: 'sup-1' });

      expect(prisma.invoiceDraft.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1', supplierId: 'sup-1' } }),
      );
    });
  });

  describe('findOne', () => {
    it('11. respeita organizationId — 404 quando não encontrado', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue(null);

      await expect(service.findOne('org-1', 'draft-x')).rejects.toThrow(NotFoundException);
      expect(prisma.invoiceDraft.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'draft-x', organizationId: 'org-1' } }),
      );
    });
  });

  describe('update', () => {
    it('12. respeita organizationId — 404 quando não encontrado', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue(null);

      await expect(
        service.update('org-1', 'draft-x', { notes: 'x' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.invoiceDraft.update).not.toHaveBeenCalled();
    });

    it('atualiza campos fornecidos, sem tocar em storageObjectId', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue({ id: 'draft-1', organizationId: 'org-1' });
      prisma.invoiceDraft.update.mockResolvedValue({ id: 'draft-1' });

      await service.update('org-1', 'draft-1', { issueDate: '2026-07-01', totalAmount: 42 });

      expect(prisma.invoiceDraft.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'draft-1' },
          data: expect.objectContaining({ totalAmount: 42 }),
        }),
      );
    });

    describe('distinção ausente / null / valor (Fase 6.8)', () => {
      beforeEach(() => {
        prisma.invoiceDraft.findFirst.mockResolvedValue({ id: 'draft-1', organizationId: 'org-1' });
        prisma.invoiceDraft.update.mockResolvedValue({ id: 'draft-1' });
      });

      it('campo ausente não é incluído no update (undefined — Prisma não altera)', async () => {
        await service.update('org-1', 'draft-1', { totalAmount: 42 });

        const data = prisma.invoiceDraft.update.mock.calls[0][0].data;
        expect(data.supplierId).toBeUndefined();
        expect(data.notes).toBeUndefined();
      });

      it.each([
        ['supplierId', 'supplierId'],
        ['categoryId', 'categoryId'],
        ['number', 'number'],
        ['totalAmount', 'totalAmount'],
        ['notes', 'notes'],
      ])('%s: null limpa o campo (passagem direta para o Prisma)', async (field) => {
        await service.update('org-1', 'draft-1', { [field]: null });

        const data = prisma.invoiceDraft.update.mock.calls[0][0].data;
        expect(data[field]).toBeNull();
      });

      it('issueDate: null limpa a data (bug real corrigido — antes colapsava para undefined)', async () => {
        await service.update('org-1', 'draft-1', { issueDate: null });

        const data = prisma.invoiceDraft.update.mock.calls[0][0].data;
        expect(data.issueDate).toBeNull();
      });

      it('dueDate: null limpa a data (bug real corrigido — antes colapsava para undefined)', async () => {
        await service.update('org-1', 'draft-1', { dueDate: null });

        const data = prisma.invoiceDraft.update.mock.calls[0][0].data;
        expect(data.dueDate).toBeNull();
      });

      it('issueDate: valor válido continua a ser convertido para Date', async () => {
        await service.update('org-1', 'draft-1', { issueDate: '2026-07-01' });

        const data = prisma.invoiceDraft.update.mock.calls[0][0].data;
        expect(data.issueDate).toEqual(new Date('2026-07-01'));
      });

      it('dueDate ausente não é incluído no update', async () => {
        await service.update('org-1', 'draft-1', { issueDate: '2026-07-01' });

        const data = prisma.invoiceDraft.update.mock.calls[0][0].data;
        expect(data.dueDate).toBeUndefined();
      });
    });
  });

  describe('remove', () => {
    it('13. respeita organizationId — 404 quando não encontrado', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue(null);

      await expect(service.remove('org-1', 'draft-x')).rejects.toThrow(NotFoundException);
      expect(prisma.invoiceDraft.delete).not.toHaveBeenCalled();
    });

    it('elimina quando o draft pertence à organização', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue({ id: 'draft-1', organizationId: 'org-1' });

      await service.remove('org-1', 'draft-1');

      expect(prisma.invoiceDraft.delete).toHaveBeenCalledWith({ where: { id: 'draft-1' } });
    });
  });

  describe('promote', () => {
    function completeDraft(overrides: Record<string, unknown> = {}) {
      return {
        id: 'draft-1',
        organizationId: 'org-1',
        storageObjectId: 'obj-1',
        supplierId: 'sup-1',
        categoryId: 'cat-1',
        number: 'F-1',
        issueDate: new Date('2026-07-01'),
        dueDate: null,
        totalAmount: 100,
        notes: 'nota',
        ...overrides,
      };
    }

    it('14. rejeita promoção com campos obrigatórios em falta', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue(
        completeDraft({ supplierId: null, issueDate: null, totalAmount: null }),
      );

      await expect(service.promote('org-1', 'draft-1')).rejects.toThrow(BadRequestException);
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('15. revalida Supplier/Category antes de promover', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue(completeDraft());
      prisma.supplier.findFirst.mockResolvedValue(null);

      await expect(service.promote('org-1', 'draft-1')).rejects.toThrow(NotFoundException);
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('16. cria Invoice com os dados do draft e status PENDING', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue(completeDraft());
      prisma.invoice.create.mockResolvedValue({ id: 'inv-1' });
      prisma.invoiceAttachment.create.mockResolvedValue({ id: 'att-1' });
      prisma.invoiceDraft.delete.mockResolvedValue({ id: 'draft-1' });

      await service.promote('org-1', 'draft-1');

      expect(prisma.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            supplierId: 'sup-1',
            categoryId: 'cat-1',
            totalAmount: 100,
            status: 'PENDING',
          }),
        }),
      );
    });

    it('17. cria InvoiceAttachment para o mesmo storageObjectId', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue(completeDraft());
      prisma.invoice.create.mockResolvedValue({ id: 'inv-1' });
      prisma.invoiceAttachment.create.mockResolvedValue({ id: 'att-1' });
      prisma.invoiceDraft.delete.mockResolvedValue({ id: 'draft-1' });

      await service.promote('org-1', 'draft-1');

      expect(prisma.invoiceAttachment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            invoiceId: 'inv-1',
            storageObjectId: 'obj-1',
          }),
        }),
      );
    });

    it('18. elimina o InvoiceDraft depois de Invoice + InvoiceAttachment', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue(completeDraft());
      prisma.invoice.create.mockResolvedValue({ id: 'inv-1' });
      prisma.invoiceAttachment.create.mockResolvedValue({ id: 'att-1' });
      prisma.invoiceDraft.delete.mockResolvedValue({ id: 'draft-1' });

      await service.promote('org-1', 'draft-1');

      expect(prisma.invoiceDraft.delete).toHaveBeenCalledWith({ where: { id: 'draft-1' } });
    });

    it('19. usa uma transação Prisma', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue(completeDraft());
      prisma.invoice.create.mockResolvedValue({ id: 'inv-1' });
      prisma.invoiceAttachment.create.mockResolvedValue({ id: 'att-1' });
      prisma.invoiceDraft.delete.mockResolvedValue({ id: 'draft-1' });

      await service.promote('org-1', 'draft-1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('20. falha ao criar InvoiceAttachment não elimina o draft', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue(completeDraft());
      prisma.invoice.create.mockResolvedValue({ id: 'inv-1' });
      prisma.invoiceAttachment.create.mockRejectedValue(new Error('falha ao criar anexo'));

      await expect(service.promote('org-1', 'draft-1')).rejects.toThrow('falha ao criar anexo');
      expect(prisma.invoiceDraft.delete).not.toHaveBeenCalled();
    });
  });

  describe('parseFiscalData (Fase 6.7)', () => {
    it('21. rejeita draft inexistente com NotFoundException (delega em findOne)', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue(null);

      await expect(service.parseFiscalData('org-1', 'draft-x')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('22. rejeita draft de outra organização com NotFoundException', async () => {
      // O filtro organizationId já faz parte da query de findOne — para
      // outra organização, o Prisma real devolveria null.
      prisma.invoiceDraft.findFirst.mockResolvedValue(null);

      await expect(service.parseFiscalData('org-1', 'draft-de-outra-org')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.invoiceDraft.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'draft-de-outra-org', organizationId: 'org-1' },
        }),
      );
    });

    it('23. rejeita ocrText null com BadRequestException', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue({
        id: 'draft-1',
        organizationId: 'org-1',
        ocrText: null,
      });

      await expect(service.parseFiscalData('org-1', 'draft-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('24. rejeita ocrText vazio/só espaços com BadRequestException', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue({
        id: 'draft-1',
        organizationId: 'org-1',
        ocrText: '   ',
      });

      await expect(service.parseFiscalData('org-1', 'draft-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('25. com ocrText válido, devolve o FiscalExtractionResult do pipeline real', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue({
        id: 'draft-1',
        organizationId: 'org-1',
        ocrText: 'Fornecedor: ACME Lda\nNIF: 123456789\nTotal a Pagar: 100,00€',
      });

      const result = await service.parseFiscalData('org-1', 'draft-1');

      expect(result.supplier?.value.name).toBe('ACME Lda');
      expect(result.supplierTaxId?.value).toBe('123456789');
      expect(result.totals?.value.totalAmount).toBe(100);
    });

    it('26. é idempotente — duas chamadas com o mesmo ocrText devolvem o mesmo resultado', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue({
        id: 'draft-1',
        organizationId: 'org-1',
        ocrText: 'Fornecedor: ACME Lda\nTotal a Pagar: 100,00€',
      });

      const first = await service.parseFiscalData('org-1', 'draft-1');
      const second = await service.parseFiscalData('org-1', 'draft-1');

      // Exclui metadata.processingTimeMs — único campo não determinístico
      // (medição de tempo), sem relação com o resultado do parsing em si.
      const { metadata: firstMetadata, ...firstResult } = first;
      const { metadata: secondMetadata, ...secondResult } = second;
      expect(secondResult).toEqual(firstResult);
      expect(secondMetadata.fieldsFound).toEqual(firstMetadata.fieldsFound);
    });

    it('27. não escreve nada — sem persistência automática do resultado', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue({
        id: 'draft-1',
        organizationId: 'org-1',
        ocrText: 'Fornecedor: ACME Lda',
      });

      await service.parseFiscalData('org-1', 'draft-1');

      expect(prisma.invoiceDraft.update).not.toHaveBeenCalled();
      expect(prisma.invoiceDraft.create).not.toHaveBeenCalled();
    });
  });
});
