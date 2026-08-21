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

/** IA sempre "indisponível" por omissão — os testes que precisam de um resultado de IA real sobrescrevem `extract`. */
function createMockAiInvoiceExtractor() {
  return { extract: jest.fn().mockResolvedValue({ extraction: null, metadata: null }) };
}
type MockAiInvoiceExtractor = ReturnType<typeof createMockAiInvoiceExtractor>;

describe('InvoiceDraftsService', () => {
  let service: InvoiceDraftsService;
  let prisma: MockPrismaService;
  let queueProducer: MockQueueProducer;
  let aiInvoiceExtractor: MockAiInvoiceExtractor;

  beforeEach(() => {
    prisma = createMockPrismaService();
    queueProducer = createMockQueueProducer();
    aiInvoiceExtractor = createMockAiInvoiceExtractor();
    service = new InvoiceDraftsService(
      prisma as never,
      queueProducer as never,
      createRealFiscalParsingService(),
      aiInvoiceExtractor as never,
    );
    // Por omissão, o StorageObject existe, pertence à organização e está
    // livre — os testes que querem o caso contrário sobrescrevem.
    prisma.storageObject.findFirst.mockResolvedValue({ id: 'obj-1', organizationId: 'org-1' });
    prisma.invoiceDraft.findFirst.mockResolvedValue(null);
    prisma.invoiceAttachment.findFirst.mockResolvedValue(null);
    prisma.supplier.findFirst.mockResolvedValue({ id: 'sup-1', organizationId: 'org-1' });
    prisma.expenseCategory.findFirst.mockResolvedValue({ id: 'cat-1', organizationId: 'org-1' });
    // Por omissão, sem linhas de staging — os testes de items/promoção
    // com linhas sobrescrevem explicitamente (Fase 6.14).
    prisma.invoiceDraftItem.findMany.mockResolvedValue([]);
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

    describe('plausibilidade da data (achado real: PATCH direto podia gravar issueDate: "2096-...")', () => {
      it('rejeita issueDate com ano implausível, sem criar o draft', async () => {
        await expect(
          service.create('org-1', { storageObjectId: 'obj-1', issueDate: '2096-07-13' }),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.invoiceDraft.create).not.toHaveBeenCalled();
      });

      it('rejeita issueDate estritamente futura, sem criar o draft', async () => {
        const nextYear = new Date().getUTCFullYear() + 1;
        await expect(
          service.create('org-1', { storageObjectId: 'obj-1', issueDate: `${nextYear}-01-01` }),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.invoiceDraft.create).not.toHaveBeenCalled();
      });

      it('rejeita dueDate com ano implausível, sem criar o draft', async () => {
        await expect(
          service.create('org-1', { storageObjectId: 'obj-1', dueDate: '2096-07-13' }),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.invoiceDraft.create).not.toHaveBeenCalled();
      });

      it('aceita dueDate futura razoável (vencimento futuro é o caso normal)', async () => {
        prisma.invoiceDraft.create.mockResolvedValue({ id: 'draft-1' });
        const nextYear = new Date().getUTCFullYear() + 1;

        await service.create('org-1', { storageObjectId: 'obj-1', dueDate: `${nextYear}-01-01` });

        expect(prisma.invoiceDraft.create).toHaveBeenCalled();
      });
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

      describe('plausibilidade da data (achado real: PATCH direto podia gravar issueDate: "2096-...")', () => {
        it('rejeita issueDate com ano implausível, sem atualizar', async () => {
          await expect(
            service.update('org-1', 'draft-1', { issueDate: '2096-07-13' }),
          ).rejects.toThrow(BadRequestException);
          expect(prisma.invoiceDraft.update).not.toHaveBeenCalled();
        });

        it('rejeita issueDate estritamente futura, sem atualizar', async () => {
          const nextYear = new Date().getUTCFullYear() + 1;
          await expect(
            service.update('org-1', 'draft-1', { issueDate: `${nextYear}-01-01` }),
          ).rejects.toThrow(BadRequestException);
          expect(prisma.invoiceDraft.update).not.toHaveBeenCalled();
        });

        it('rejeita dueDate com ano implausível, sem atualizar', async () => {
          await expect(
            service.update('org-1', 'draft-1', { dueDate: '2096-07-13' }),
          ).rejects.toThrow(BadRequestException);
          expect(prisma.invoiceDraft.update).not.toHaveBeenCalled();
        });

        it('issueDate: null nunca é validado (é para limpar, não um valor a verificar)', async () => {
          await service.update('org-1', 'draft-1', { issueDate: null });

          expect(prisma.invoiceDraft.update).toHaveBeenCalled();
        });
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

    /**
     * Correção pós-revisão Codex (achado 6, ALTO — lost update). A versão
     * anterior lia `draft`/`draftItems` ANTES de abrir a transação — uma
     * alteração concorrente entre essa leitura e o `DELETE` final ficava
     * perdida silenciosamente. A correção usa `SELECT ... FOR UPDATE`
     * (`tx.$queryRaw`) para bloquear a linha do `InvoiceDraft` logo no
     * início da transação, ANTES de qualquer leitura que determine os
     * valores promovidos — só depois desse lock é que `draft`/
     * `draftItems` são lidos. Num Postgres real, qualquer escrita
     * concorrente à mesma linha (ex. `replaceItems()`, um `PATCH` ao
     * cabeçalho) fica bloqueada até este COMMIT/ROLLBACK, nunca perdida.
     * Como o mock não tem estado real de concorrência, este teste prova
     * o mecanismo que garante essa proteção: a ordem de chamadas (lock
     * sempre primeiro) e os parâmetros exatos do lock (id +
     * organizationId corretos, nunca um lock genérico).
     */
    describe('achado 6 (alto) — lost update na promoção', () => {
      it('bloqueia a linha do InvoiceDraft (SELECT ... FOR UPDATE) ANTES de ler draft/items — nunca lê valores a promover sem o lock já ativo', async () => {
        prisma.invoiceDraft.findFirst.mockResolvedValue(completeDraft());
        prisma.invoice.create.mockResolvedValue({ id: 'inv-1' });
        prisma.invoiceAttachment.create.mockResolvedValue({ id: 'att-1' });
        prisma.invoiceDraft.delete.mockResolvedValue({ id: 'draft-1' });

        await service.promote('org-1', 'draft-1');

        expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
        const lockOrder = prisma.$queryRaw.mock.invocationCallOrder[0];
        const draftReadOrder = prisma.invoiceDraft.findFirst.mock.invocationCallOrder[0];
        const itemsReadOrder = prisma.invoiceDraftItem.findMany.mock.invocationCallOrder[0];
        expect(lockOrder).toBeLessThan(draftReadOrder);
        expect(lockOrder).toBeLessThan(itemsReadOrder);

        const [strings, ...values] = prisma.$queryRaw.mock.calls[0];
        expect(strings.join(' ')).toContain('FOR UPDATE');
        expect(values).toContain('draft-1');
        expect(values).toContain('org-1');
      });

      it('se o lock não encontrar a linha (ex. já apagada/promovida por outra transação concorrente), falha 404 de imediato, sem ler draft/items nem escrever nada', async () => {
        prisma.$queryRaw.mockResolvedValueOnce([]);

        await expect(service.promote('org-1', 'draft-1')).rejects.toThrow(NotFoundException);
        expect(prisma.invoiceDraft.findFirst).not.toHaveBeenCalled();
        expect(prisma.invoiceDraftItem.findMany).not.toHaveBeenCalled();
        expect(prisma.invoice.create).not.toHaveBeenCalled();
      });
    });

    describe('items (Fase 6.14)', () => {
      function draftItem(overrides: Record<string, unknown> = {}) {
        return {
          id: 'item-1',
          organizationId: 'org-1',
          invoiceDraftId: 'draft-1',
          position: 1,
          description: 'Farinha 25kg',
          quantity: 2,
          unit: 'saco',
          unitPrice: 18.5,
          vatRate: 23,
          totalPrice: 37,
          ...overrides,
        };
      }

      it('promoção sem nenhuma linha continua coerente (comportamento anterior preservado)', async () => {
        prisma.invoiceDraft.findFirst.mockResolvedValue(completeDraft());
        prisma.invoiceDraftItem.findMany.mockResolvedValue([]);
        prisma.invoice.create.mockResolvedValue({ id: 'inv-1' });
        prisma.invoiceAttachment.create.mockResolvedValue({ id: 'att-1' });
        prisma.invoiceDraft.delete.mockResolvedValue({ id: 'draft-1' });

        await service.promote('org-1', 'draft-1');

        const call = prisma.invoice.create.mock.calls[0][0];
        expect(call.data.items).toBeUndefined();
      });

      it('copia as linhas completas para Invoice.items — position/unit/vatRate/precisão preservados', async () => {
        prisma.invoiceDraft.findFirst.mockResolvedValue(completeDraft());
        prisma.invoiceDraftItem.findMany.mockResolvedValue([draftItem()]);
        prisma.invoice.create.mockResolvedValue({ id: 'inv-1' });
        prisma.invoiceAttachment.create.mockResolvedValue({ id: 'att-1' });
        prisma.invoiceDraft.delete.mockResolvedValue({ id: 'draft-1' });

        await service.promote('org-1', 'draft-1');

        expect(prisma.invoice.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              items: {
                create: [
                  {
                    position: 1,
                    description: 'Farinha 25kg',
                    quantity: 2,
                    unit: 'saco',
                    unitPrice: 18.5,
                    vatRate: 23,
                    totalPrice: 37,
                  },
                ],
              },
            }),
          }),
        );
      });

      it('rejeita a promoção quando uma linha não tem quantidade/preço unitário/total preenchidos — nunca inventa o valor em falta', async () => {
        prisma.invoiceDraft.findFirst.mockResolvedValue(completeDraft());
        prisma.invoiceDraftItem.findMany.mockResolvedValue([draftItem({ unitPrice: null })]);

        await expect(service.promote('org-1', 'draft-1')).rejects.toThrow(BadRequestException);
        expect(prisma.invoice.create).not.toHaveBeenCalled();
      });

      it('carrega as linhas sempre filtrando por invoiceDraftId E organizationId em simultâneo (isolamento multi-tenant)', async () => {
        prisma.invoiceDraft.findFirst.mockResolvedValue(completeDraft());
        prisma.invoiceDraftItem.findMany.mockResolvedValue([draftItem()]);
        prisma.invoice.create.mockResolvedValue({ id: 'inv-1' });
        prisma.invoiceAttachment.create.mockResolvedValue({ id: 'att-1' });
        prisma.invoiceDraft.delete.mockResolvedValue({ id: 'draft-1' });

        await service.promote('org-1', 'draft-1');

        expect(prisma.invoiceDraftItem.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: { invoiceDraftId: 'draft-1', organizationId: 'org-1' } }),
        );
      });

      it('rollback completo: se a criação do InvoiceItem falhar (via invoice.create), nem Invoice nem InvoiceAttachment persistem, e o InvoiceDraftItem de staging permanece', async () => {
        prisma.invoiceDraft.findFirst.mockResolvedValue(completeDraft());
        prisma.invoiceDraftItem.findMany.mockResolvedValue([draftItem()]);
        prisma.invoice.create.mockRejectedValue(new Error('falha ao criar items'));

        await expect(service.promote('org-1', 'draft-1')).rejects.toThrow('falha ao criar items');
        expect(prisma.invoiceAttachment.create).not.toHaveBeenCalled();
        expect(prisma.invoiceDraft.delete).not.toHaveBeenCalled();
        // O staging (InvoiceDraftItem) nunca é apagado por este método diretamente — só via cascade
        // ao eliminar o InvoiceDraft, que aqui nunca chega a acontecer.
        expect(prisma.invoiceDraftItem.deleteMany).not.toHaveBeenCalled();
      });
    });
  });

  describe('runAiExtraction (Fase 6.14)', () => {
    function draftWithOcr(overrides: Record<string, unknown> = {}) {
      return {
        id: 'draft-1',
        organizationId: 'org-1',
        itemsReviewedByHuman: false,
        ocrText: 'Fornecedor: Acme Distribuição Lda\nNIF: 123456789\nTotal: 123,00 EUR',
        ...overrides,
      };
    }

    const AI_EXTRACTION_WITH_ITEMS = {
      schemaVersion: '1' as const,
      supplier: { name: 'Acme Distribuição Lda', taxId: '123456789' },
      invoice: { number: null, issueDate: null, dueDate: null, currency: 'EUR' },
      totals: { subtotal: null, vatAmount: null, total: '123.00' },
      items: [
        {
          position: 1,
          description: 'Farinha 25kg',
          quantity: '2',
          unit: 'saco',
          unitPrice: '18.50',
          vatRate: '23',
          totalPrice: '37.00',
        },
      ],
    };
    const AI_METADATA = { provider: 'openrouter', model: 'openai/gpt-4o-mini', inputTokens: 500, outputTokens: 80, durationMs: 900 };

    it('rejeita quando o draft ainda não tem ocrText', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue(draftWithOcr({ ocrText: null }));

      await expect(service.runAiExtraction('org-1', 'draft-1')).rejects.toThrow(BadRequestException);
      expect(aiInvoiceExtractor.extract).not.toHaveBeenCalled();
    });

    it('itemsReviewedByHuman ainda false + IA devolve linhas: persiste InvoiceDraftItem e devolve itemsPersisted true', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue(draftWithOcr());
      aiInvoiceExtractor.extract.mockResolvedValue({ extraction: AI_EXTRACTION_WITH_ITEMS, metadata: AI_METADATA });
      prisma.invoiceDraftItem.findMany.mockResolvedValue([{ id: 'item-1', position: 1, description: 'Farinha 25kg' }]);

      const result = await service.runAiExtraction('org-1', 'draft-1');

      expect(result.itemsPersisted).toBe(true);
      // Correção pós-revisão Codex (achado 11, multi-tenant): `organizationId`
      // explícito também em `deleteMany`, nunca só `invoiceDraftId`.
      expect(prisma.invoiceDraftItem.deleteMany).toHaveBeenCalledWith({
        where: { invoiceDraftId: 'draft-1', organizationId: 'org-1' },
      });
      expect(prisma.invoiceDraftItem.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            expect.objectContaining({
              organizationId: 'org-1',
              invoiceDraftId: 'draft-1',
              position: 1,
              description: 'Farinha 25kg',
              quantity: '2',
              unit: 'saco',
              unitPrice: '18.50',
              vatRate: '23',
              totalPrice: '37.00',
            }),
          ],
        }),
      );
    });

    it('itemsReviewedByHuman já true: NUNCA volta a escrever as linhas, mesmo com uma sugestão de IA diferente — não sobrescreve correção humana', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue(draftWithOcr({ itemsReviewedByHuman: true }));
      aiInvoiceExtractor.extract.mockResolvedValue({ extraction: AI_EXTRACTION_WITH_ITEMS, metadata: AI_METADATA });

      const result = await service.runAiExtraction('org-1', 'draft-1');

      expect(result.itemsPersisted).toBe(false);
      expect(prisma.invoiceDraftItem.deleteMany).not.toHaveBeenCalled();
      expect(prisma.invoiceDraftItem.createMany).not.toHaveBeenCalled();
    });

    it('IA indisponível (extraction null): nunca lança, reconciliação usa só o determinístico, items fica vazio', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue(draftWithOcr());
      aiInvoiceExtractor.extract.mockResolvedValue({ extraction: null, metadata: null });

      const result = await service.runAiExtraction('org-1', 'draft-1');

      expect(result.reconciliation.items).toEqual([]);
      expect(result.itemsPersisted).toBe(false);
      expect(prisma.invoiceDraftAiExtraction.upsert).not.toHaveBeenCalled();
    });

    it('persiste metadata da IA (provider/model/tokens/duração) via upsert — uma linha por draft', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue(draftWithOcr());
      aiInvoiceExtractor.extract.mockResolvedValue({ extraction: AI_EXTRACTION_WITH_ITEMS, metadata: AI_METADATA });
      prisma.invoiceDraftItem.findMany.mockResolvedValue([]);

      await service.runAiExtraction('org-1', 'draft-1');

      expect(prisma.invoiceDraftAiExtraction.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { invoiceDraftId: 'draft-1' },
          create: expect.objectContaining({
            organizationId: 'org-1',
            invoiceDraftId: 'draft-1',
            schemaVersion: '1',
            provider: 'openrouter',
            model: 'openai/gpt-4o-mini',
            inputTokens: 500,
            outputTokens: 80,
            durationMs: 900,
          }),
        }),
      );
    });

    /**
     * Correção pós-revisão Codex (achado 1, CRÍTICO — race condition,
     * 2ª ronda). A versão anterior deste teste usava
     * `mockResolvedValueOnce(false).mockResolvedValueOnce(true)` — uma
     * sequência de valores de retorno pré-programada, nunca uma corrida
     * real (a revisão apontou isto explicitamente: "isso não prova a
     * race"). Este teste usa uma Promise pendente REAL e controlada pelo
     * teste para o "provider": `runAiExtraction()` arranca, fica
     * genuinamente bloqueado (nunca chega a abrir a transação — o
     * `await Promise.all(...)` ainda não resolveu), confirma-se que a
     * chamada ainda não terminou, só DEPOIS disso um `replaceItems()`
     * concorrente corre e termina por completo (grava as linhas
     * humanas, marca `itemsReviewedByHuman = true` no estado partilhado
     * que ambos os métodos leem/escrevem através do mock), e só então a
     * Promise do provider é resolvida. Prova que a decisão de
     * `runAiExtraction()` nunca pode ver um estado mais antigo do que o
     * que existia no momento em que a transação abre — nunca o
     * `mockResolvedValueOnce` a fingir essa propriedade.
     */
    it('achado 1 (crítico, 2ª ronda) — Promise real e controlada para o provider: runAiExtraction só decide depois de replaceItems() concorrente ter terminado por completo, nunca com base num valor anterior à resposta do provider', async () => {
      const state: { itemsReviewedByHuman: boolean; items: Array<Record<string, unknown>> } = {
        itemsReviewedByHuman: false,
        items: [],
      };
      prisma.invoiceDraft.findFirst.mockImplementation((async (args: { where: { id: string; organizationId: string }; select?: unknown }) => {
        if (args.where.id !== 'draft-1' || args.where.organizationId !== 'org-1') return null;
        if (args.select) return { itemsReviewedByHuman: state.itemsReviewedByHuman };
        return draftWithOcr({ itemsReviewedByHuman: state.itemsReviewedByHuman });
      }) as never);
      prisma.invoiceDraft.update.mockImplementation((async (args: { data: { itemsReviewedByHuman?: boolean } }) => {
        if (args.data.itemsReviewedByHuman !== undefined) state.itemsReviewedByHuman = args.data.itemsReviewedByHuman;
        return { id: 'draft-1' };
      }) as never);
      prisma.invoiceDraftItem.deleteMany.mockImplementation((async () => {
        state.items = [];
        return { count: 0 };
      }) as never);
      prisma.invoiceDraftItem.createMany.mockImplementation((async (args: { data: Array<Record<string, unknown>> }) => {
        state.items = args.data;
        return { count: args.data.length };
      }) as never);
      prisma.invoiceDraftItem.findMany.mockImplementation((async () => state.items) as never);

      let resolveProvider!: (value: { extraction: typeof AI_EXTRACTION_WITH_ITEMS; metadata: typeof AI_METADATA }) => void;
      const providerPromise = new Promise<{ extraction: typeof AI_EXTRACTION_WITH_ITEMS; metadata: typeof AI_METADATA }>(
        (resolve) => {
          resolveProvider = resolve;
        },
      );
      aiInvoiceExtractor.extract.mockReturnValue(providerPromise as never);

      const runAiPromise = service.runAiExtraction('org-1', 'draft-1');
      let aiSettled = false;
      runAiPromise.then(
        () => {
          aiSettled = true;
        },
        () => {
          aiSettled = true;
        },
      );

      // Vários "ticks" do event loop — confirma que runAiExtraction()
      // continua genuinamente bloqueado no provider, nunca terminou.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(aiSettled).toBe(false);

      // A revisão humana concorrente TERMINA por completo enquanto a IA
      // ainda espera pelo provider.
      await service.replaceItems('org-1', 'draft-1', [
        { description: 'Linha corrigida pelo humano', unitPrice: 1 } as never,
      ]);
      expect(state.itemsReviewedByHuman).toBe(true);
      const humanItemsSnapshot = [...state.items];

      // Só agora o provider "responde" — runAiExtraction() pode
      // finalmente abrir a sua transação e decidir.
      resolveProvider({ extraction: AI_EXTRACTION_WITH_ITEMS, metadata: AI_METADATA });
      const result = await runAiPromise;

      expect(result.itemsPersisted).toBe(false);
      expect(state.items).toEqual(humanItemsSnapshot);
      expect(state.itemsReviewedByHuman).toBe(true);
    });

    describe('achado 1 (crítico, 2ª ronda) — todos os writers serializam pela mesma linha InvoiceDraft', () => {
      it('adquire SELECT ... FOR UPDATE (lockInvoiceDraftRow) como a PRIMEIRA operação dentro da transação, antes de ler itemsReviewedByHuman', async () => {
        prisma.invoiceDraft.findFirst.mockResolvedValue(draftWithOcr());
        aiInvoiceExtractor.extract.mockResolvedValue({ extraction: null, metadata: null });

        await service.runAiExtraction('org-1', 'draft-1');

        expect(prisma.$queryRaw).toHaveBeenCalled();
        const lockOrder = prisma.$queryRaw.mock.invocationCallOrder[0];
        // A 2ª chamada a `invoiceDraft.findFirst` é a releitura de
        // `itemsReviewedByHuman` dentro da transação (a 1ª é o
        // `findOne()` de pré-verificação, ainda antes da transação).
        const rereadOrder = prisma.invoiceDraft.findFirst.mock.invocationCallOrder[1];
        expect(lockOrder).toBeLessThan(rereadOrder);
      });

      it('se o lock não encontrar a linha (apagada/promovida concorrentemente), falha 404 dentro da transação, sem tocar em InvoiceDraftItem', async () => {
        prisma.invoiceDraft.findFirst.mockResolvedValue(draftWithOcr());
        aiInvoiceExtractor.extract.mockResolvedValue({ extraction: AI_EXTRACTION_WITH_ITEMS, metadata: AI_METADATA });
        prisma.$queryRaw.mockResolvedValueOnce([]);

        await expect(service.runAiExtraction('org-1', 'draft-1')).rejects.toThrow(NotFoundException);
        expect(prisma.invoiceDraftItem.deleteMany).not.toHaveBeenCalled();
        expect(prisma.invoiceDraftItem.createMany).not.toHaveBeenCalled();
        expect(prisma.invoiceDraftAiExtraction.upsert).not.toHaveBeenCalled();
      });
    });

    /**
     * Achado 7 (médio) — uma extração de IA VÁLIDA com `items: []`
     * enquanto `itemsReviewedByHuman` ainda é `false` tem de limpar o
     * staging automático anterior para vazio também — nunca deixar as
     * linhas antigas por tocar só porque a nova sugestão não tem linhas.
     */
    it('achado 7 (médio) — items: [] com itemsReviewedByHuman ainda false: uma extração IA válida sem linhas limpa o staging automático anterior', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue(draftWithOcr({ itemsReviewedByHuman: false }));
      aiInvoiceExtractor.extract.mockResolvedValue({
        extraction: { ...AI_EXTRACTION_WITH_ITEMS, items: [] },
        metadata: AI_METADATA,
      });
      prisma.invoiceDraftItem.findMany.mockResolvedValue([]);

      const result = await service.runAiExtraction('org-1', 'draft-1');

      expect(result.itemsPersisted).toBe(true);
      expect(prisma.invoiceDraftItem.deleteMany).toHaveBeenCalledWith({
        where: { invoiceDraftId: 'draft-1', organizationId: 'org-1' },
      });
      expect(prisma.invoiceDraftItem.createMany).not.toHaveBeenCalled();
      expect(result.items).toEqual([]);
    });

    describe('achado 8 (médio) — atomicidade items/metadata', () => {
      it('se o upsert da metadata falhar, a promessa inteira rejeita — mesma transação cobre items+metadata, nunca uma escrita parcial exposta ao chamador', async () => {
        prisma.invoiceDraft.findFirst.mockResolvedValue(draftWithOcr({ itemsReviewedByHuman: false }));
        aiInvoiceExtractor.extract.mockResolvedValue({ extraction: AI_EXTRACTION_WITH_ITEMS, metadata: AI_METADATA });
        prisma.invoiceDraftAiExtraction.upsert.mockRejectedValue(new Error('falha ao gravar metadata'));

        await expect(service.runAiExtraction('org-1', 'draft-1')).rejects.toThrow('falha ao gravar metadata');
      });

      it('se a escrita das linhas falhar, o upsert da metadata nunca chega a ser chamado — nunca metadata escrita sem as linhas correspondentes da mesma extração', async () => {
        prisma.invoiceDraft.findFirst.mockResolvedValue(draftWithOcr({ itemsReviewedByHuman: false }));
        aiInvoiceExtractor.extract.mockResolvedValue({ extraction: AI_EXTRACTION_WITH_ITEMS, metadata: AI_METADATA });
        prisma.invoiceDraftItem.deleteMany.mockRejectedValue(new Error('falha ao limpar linhas'));

        await expect(service.runAiExtraction('org-1', 'draft-1')).rejects.toThrow('falha ao limpar linhas');
        expect(prisma.invoiceDraftAiExtraction.upsert).not.toHaveBeenCalled();
      });
    });
  });

  describe('replaceItems (Fase 6.14)', () => {
    it('substitui integralmente as linhas (deleteMany + createMany) e marca itemsReviewedByHuman true', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue({ id: 'draft-1', organizationId: 'org-1' });
      prisma.invoiceDraftItem.findMany.mockResolvedValue([{ id: 'item-1', position: 1, description: 'Novo item' }]);

      await service.replaceItems('org-1', 'draft-1', [
        { description: 'Novo item', quantity: 1, unitPrice: 10, totalPrice: 10 } as never,
      ]);

      // Correção pós-revisão Codex (achado 11, multi-tenant): `organizationId`
      // explícito também em `deleteMany`, nunca só `invoiceDraftId`.
      expect(prisma.invoiceDraftItem.deleteMany).toHaveBeenCalledWith({
        where: { invoiceDraftId: 'draft-1', organizationId: 'org-1' },
      });
      expect(prisma.invoiceDraftItem.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            expect.objectContaining({
              organizationId: 'org-1',
              invoiceDraftId: 'draft-1',
              position: 1,
              description: 'Novo item',
              quantity: 1,
              unitPrice: 10,
              totalPrice: 10,
            }),
          ],
        }),
      );
      expect(prisma.invoiceDraft.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'draft-1' }, data: { itemsReviewedByHuman: true } }),
      );
    });

    it('position ausente numa linha usa o índice no array (índice + 1)', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue({ id: 'draft-1', organizationId: 'org-1' });
      prisma.invoiceDraftItem.findMany.mockResolvedValue([]);

      await service.replaceItems('org-1', 'draft-1', [
        { description: 'A', unitPrice: 1 } as never,
        { description: 'B', unitPrice: 2 } as never,
      ]);

      const created = prisma.invoiceDraftItem.createMany.mock.calls[0][0].data;
      expect(created.map((item: { position: number }) => item.position)).toEqual([1, 2]);
    });

    it('array vazio limpa todas as linhas (elimina tudo, sem criar nada) e ainda marca itemsReviewedByHuman true', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue({ id: 'draft-1', organizationId: 'org-1' });
      prisma.invoiceDraftItem.findMany.mockResolvedValue([]);

      await service.replaceItems('org-1', 'draft-1', []);

      // Correção pós-revisão Codex (achado 11, multi-tenant): `organizationId`
      // explícito também em `deleteMany`, nunca só `invoiceDraftId`.
      expect(prisma.invoiceDraftItem.deleteMany).toHaveBeenCalledWith({
        where: { invoiceDraftId: 'draft-1', organizationId: 'org-1' },
      });
      expect(prisma.invoiceDraftItem.createMany).not.toHaveBeenCalled();
      expect(prisma.invoiceDraft.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { itemsReviewedByHuman: true } }),
      );
    });

    it('respeita organizationId — 404 quando o draft não pertence à organização', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue(null);

      await expect(service.replaceItems('org-1', 'draft-1', [])).rejects.toThrow(NotFoundException);
      expect(prisma.invoiceDraftItem.deleteMany).not.toHaveBeenCalled();
    });

    describe('achado 1 (crítico, 2ª ronda) — serializa pela mesma linha InvoiceDraft', () => {
      it('adquire SELECT ... FOR UPDATE (lockInvoiceDraftRow) ANTES de tocar em InvoiceDraftItem — mesma convenção de runAiExtraction()/saveReview()/promote()', async () => {
        prisma.invoiceDraft.findFirst.mockResolvedValue({ id: 'draft-1', organizationId: 'org-1' });
        prisma.invoiceDraftItem.findMany.mockResolvedValue([]);

        await service.replaceItems('org-1', 'draft-1', []);

        const lockOrder = prisma.$queryRaw.mock.invocationCallOrder[0];
        const deleteOrder = prisma.invoiceDraftItem.deleteMany.mock.invocationCallOrder[0];
        expect(lockOrder).toBeLessThan(deleteOrder);
      });

      it('se o lock não encontrar a linha (apagada/promovida concorrentemente), falha 404 dentro da transação, sem tocar em InvoiceDraftItem', async () => {
        prisma.invoiceDraft.findFirst.mockResolvedValue({ id: 'draft-1', organizationId: 'org-1' });
        prisma.$queryRaw.mockResolvedValueOnce([]);

        await expect(service.replaceItems('org-1', 'draft-1', [{ description: 'X' } as never])).rejects.toThrow(
          NotFoundException,
        );
        expect(prisma.invoiceDraftItem.deleteMany).not.toHaveBeenCalled();
        expect(prisma.invoiceDraftItem.createMany).not.toHaveBeenCalled();
        expect(prisma.invoiceDraft.update).not.toHaveBeenCalled();
      });
    });
  });

  describe('saveReview (achado 9, correção pós-revisão Codex) — cabeçalho + linhas atómicos', () => {
    beforeEach(() => {
      prisma.invoiceDraft.findFirst.mockResolvedValue({ id: 'draft-1', organizationId: 'org-1' });
      prisma.invoiceDraftItem.findMany.mockResolvedValue([]);
    });

    it('grava só o cabeçalho quando só `patch` é enviado — nunca toca nas linhas', async () => {
      await service.saveReview('org-1', 'draft-1', { patch: { number: 'F-2' } });

      expect(prisma.invoiceDraft.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'draft-1' }, data: expect.objectContaining({ number: 'F-2' }) }),
      );
      expect(prisma.invoiceDraftItem.deleteMany).not.toHaveBeenCalled();
      expect(prisma.invoiceDraftItem.createMany).not.toHaveBeenCalled();
    });

    it('grava só as linhas quando só `items` é enviado — nunca gera um update de cabeçalho', async () => {
      await service.saveReview('org-1', 'draft-1', {
        items: [{ description: 'Linha única', unitPrice: 10 } as never],
      });

      expect(prisma.invoiceDraftItem.deleteMany).toHaveBeenCalledWith({
        where: { invoiceDraftId: 'draft-1', organizationId: 'org-1' },
      });
      expect(prisma.invoiceDraftItem.createMany).toHaveBeenCalled();
      // Uma única chamada a `invoiceDraft.update` — só para marcar
      // `itemsReviewedByHuman: true`, nunca com campos de cabeçalho.
      expect(prisma.invoiceDraft.update).toHaveBeenCalledTimes(1);
      expect(prisma.invoiceDraft.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { itemsReviewedByHuman: true } }),
      );
    });

    it('grava cabeçalho e linhas juntos, dentro da mesma transação Prisma', async () => {
      await service.saveReview('org-1', 'draft-1', {
        patch: { number: 'F-3' },
        items: [{ description: 'Linha', unitPrice: 5 } as never],
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.invoiceDraft.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ number: 'F-3' }) }),
      );
      expect(prisma.invoiceDraftItem.createMany).toHaveBeenCalled();
    });

    /**
     * Achado 9 — a falha ao gravar as linhas nunca deixa o cabeçalho
     * persistido sozinho: ambos vivem na mesma transação Prisma, por
     * isso um erro em qualquer parte rejeita a promessa inteira, nunca
     * um sucesso parcial silencioso.
     */
    it('se a escrita das linhas falhar, a promessa inteira rejeita — nunca um cabeçalho persistido sozinho sem as linhas correspondentes', async () => {
      prisma.invoiceDraftItem.deleteMany.mockRejectedValue(new Error('falha ao limpar linhas'));

      await expect(
        service.saveReview('org-1', 'draft-1', {
          patch: { number: 'F-4' },
          items: [{ description: 'Linha', unitPrice: 5 } as never],
        }),
      ).rejects.toThrow('falha ao limpar linhas');
    });

    it('items: [] limpa todas as linhas (mesma semântica de replaceItems)', async () => {
      await service.saveReview('org-1', 'draft-1', { items: [] });

      expect(prisma.invoiceDraftItem.deleteMany).toHaveBeenCalledWith({
        where: { invoiceDraftId: 'draft-1', organizationId: 'org-1' },
      });
      expect(prisma.invoiceDraftItem.createMany).not.toHaveBeenCalled();
    });

    it('respeita organizationId — 404 quando o draft não pertence à organização, sem escrever nada', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue(null);

      await expect(service.saveReview('org-1', 'draft-1', { patch: { number: 'F-5' } })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.invoiceDraft.update).not.toHaveBeenCalled();
    });

    it('revalida supplier/categoria antes de escrever, tal como update()', async () => {
      prisma.supplier.findFirst.mockResolvedValue(null);

      await expect(
        service.saveReview('org-1', 'draft-1', { patch: { supplierId: 'sup-x' } }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.invoiceDraft.update).not.toHaveBeenCalled();
    });

    describe('achado 1 (crítico, 2ª ronda) — serializa pela mesma linha InvoiceDraft', () => {
      it('adquire SELECT ... FOR UPDATE (lockInvoiceDraftRow) ANTES de atualizar patch/items — mesma convenção de runAiExtraction()/replaceItems()/promote()', async () => {
        await service.saveReview('org-1', 'draft-1', {
          patch: { number: 'F-6' },
          items: [{ description: 'Linha', unitPrice: 1 } as never],
        });

        const lockOrder = prisma.$queryRaw.mock.invocationCallOrder[0];
        const patchOrder = prisma.invoiceDraft.update.mock.invocationCallOrder[0];
        const itemsOrder = prisma.invoiceDraftItem.deleteMany.mock.invocationCallOrder[0];
        expect(lockOrder).toBeLessThan(patchOrder);
        expect(lockOrder).toBeLessThan(itemsOrder);
      });

      it('se o lock não encontrar a linha (apagada/promovida concorrentemente), falha 404 dentro da transação, sem escrever patch nem items', async () => {
        prisma.$queryRaw.mockResolvedValueOnce([]);

        await expect(
          service.saveReview('org-1', 'draft-1', {
            patch: { number: 'F-7' },
            items: [{ description: 'Linha', unitPrice: 1 } as never],
          }),
        ).rejects.toThrow(NotFoundException);
        expect(prisma.invoiceDraft.update).not.toHaveBeenCalled();
        expect(prisma.invoiceDraftItem.deleteMany).not.toHaveBeenCalled();
        expect(prisma.invoiceDraftItem.createMany).not.toHaveBeenCalled();
      });
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
