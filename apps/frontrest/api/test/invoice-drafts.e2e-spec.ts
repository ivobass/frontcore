import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { OCR_PROCESSING_QUEUE } from '@frontcore/queue';
import { createTestApp } from './utils/bootstrap-app';
import { authHeader } from './utils/auth';
import type { MockPrismaService } from './utils/mock-prisma';
import type { MockQueueProducer } from './utils/mock-queue-producer';

describe('Invoice Drafts (e2e)', () => {
  let app: INestApplication;
  let prisma: MockPrismaService;
  let queueProducer: MockQueueProducer;

  beforeAll(async () => {
    ({ app, prisma, queueProducer } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function mockStorageObjectAvailable() {
    prisma.storageObject.findFirst.mockResolvedValue({
      id: 'obj-1',
      organizationId: 'org-1',
      key: 'organizations/org-1/uploads/obj-1',
    });
  }

  describe('autenticação', () => {
    it('GET /api/invoices/drafts sem token → 401', async () => {
      await request(app.getHttpServer()).get('/api/invoices/drafts').expect(401);
    });
  });

  describe('roles', () => {
    it('POST /api/invoices/drafts como MEMBER → 403', async () => {
      await request(app.getHttpServer())
        .post('/api/invoices/drafts')
        .set('Authorization', authHeader({ role: 'MEMBER' }))
        .send({ storageObjectId: 'obj-1' })
        .expect(403);
    });

    it('GET /api/invoices/drafts como MEMBER → 200 (consulta permitida)', async () => {
      prisma.invoiceDraft.findMany.mockResolvedValue([]);
      prisma.invoiceDraft.count.mockResolvedValue(0);

      await request(app.getHttpServer())
        .get('/api/invoices/drafts')
        .set('Authorization', authHeader({ role: 'MEMBER' }))
        .expect(200);
    });

    it('POST /api/invoices/drafts/:id/promote como MEMBER → 403', async () => {
      await request(app.getHttpServer())
        .post('/api/invoices/drafts/draft-1/promote')
        .set('Authorization', authHeader({ role: 'MEMBER' }))
        .expect(403);
    });
  });

  describe('rota estática /invoices/drafts não colide com /invoices/:id', () => {
    it('GET /api/invoices/drafts devolve a listagem de rascunhos, não um 404 de InvoicesController', async () => {
      prisma.invoiceDraft.findMany.mockResolvedValue([{ id: 'draft-1' }]);
      prisma.invoiceDraft.count.mockResolvedValue(1);

      const response = await request(app.getHttpServer())
        .get('/api/invoices/drafts')
        .set('Authorization', authHeader({ organizationId: 'org-1' }))
        .expect(200);

      expect(response.body.items).toHaveLength(1);
    });
  });

  describe('CRUD completo', () => {
    it('POST cria um draft a partir de um StorageObject válido → 201', async () => {
      mockStorageObjectAvailable();
      prisma.invoiceDraft.findFirst.mockResolvedValue(null);
      prisma.invoiceAttachment.findFirst.mockResolvedValue(null);
      prisma.invoiceDraft.create.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'draft-1', ...data }),
      );

      const response = await request(app.getHttpServer())
        .post('/api/invoices/drafts')
        .set('Authorization', authHeader({ role: 'MANAGER', organizationId: 'org-1' }))
        .send({ storageObjectId: 'obj-1' })
        .expect(201);

      expect(response.body.id).toBe('draft-1');
    });

    it('POST publica o job OCR correto através do QueueProducer mockado (Fase 6.4)', async () => {
      mockStorageObjectAvailable();
      prisma.invoiceDraft.findFirst.mockResolvedValue(null);
      prisma.invoiceAttachment.findFirst.mockResolvedValue(null);
      prisma.invoiceDraft.create.mockResolvedValue({
        id: 'draft-ocr-1',
        storageObjectId: 'obj-1',
      });

      await request(app.getHttpServer())
        .post('/api/invoices/drafts')
        .set('Authorization', authHeader({ role: 'MANAGER', organizationId: 'org-1' }))
        .send({ storageObjectId: 'obj-1' })
        .expect(201);

      expect(queueProducer.add).toHaveBeenCalledWith(
        OCR_PROCESSING_QUEUE,
        {
          invoiceDraftId: 'draft-ocr-1',
          storageObjectId: 'obj-1',
          organizationId: 'org-1',
        },
        expect.objectContaining({
          jobId: 'invoice-draft-ocr-draft-ocr-1',
          attempts: 3,
          backoff: { type: 'exponential', delayMs: 5000 },
        }),
      );
    });

    it('POST devolve 503 (sem expor detalhes internos) quando a publicação do job falha', async () => {
      mockStorageObjectAvailable();
      prisma.invoiceDraft.findFirst.mockResolvedValue(null);
      prisma.invoiceAttachment.findFirst.mockResolvedValue(null);
      prisma.invoiceDraft.create.mockResolvedValue({
        id: 'draft-falha-fila',
        storageObjectId: 'obj-1',
      });
      queueProducer.add.mockRejectedValueOnce(new Error('ECONNREFUSED 127.0.0.1:6379'));

      const response = await request(app.getHttpServer())
        .post('/api/invoices/drafts')
        .set('Authorization', authHeader({ role: 'MANAGER', organizationId: 'org-1' }))
        .send({ storageObjectId: 'obj-1' })
        .expect(503);

      expect(JSON.stringify(response.body)).not.toMatch(/ECONNREFUSED|6379|redis/i);
      expect(prisma.invoiceDraft.delete).not.toHaveBeenCalled();
    });

    it('GET :id devolve o draft', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue({ id: 'draft-1', organizationId: 'org-1' });

      const response = await request(app.getHttpServer())
        .get('/api/invoices/drafts/draft-1')
        .set('Authorization', authHeader({ organizationId: 'org-1' }))
        .expect(200);

      expect(response.body.id).toBe('draft-1');
    });

    it('GET :id inexistente → 404', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/invoices/drafts/draft-x')
        .set('Authorization', authHeader({ organizationId: 'org-1' }))
        .expect(404);
    });

    it('PATCH :id atualiza campos como MANAGER → 200', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue({ id: 'draft-1', organizationId: 'org-1' });
      prisma.invoiceDraft.update.mockResolvedValue({ id: 'draft-1', totalAmount: 50 });

      const response = await request(app.getHttpServer())
        .patch('/api/invoices/drafts/draft-1')
        .set('Authorization', authHeader({ role: 'MANAGER', organizationId: 'org-1' }))
        .send({ totalAmount: 50 })
        .expect(200);

      expect(response.body.totalAmount).toBe(50);
    });

    it('PATCH :id com storageObjectId no corpo → 400 (campo imutável, não permitido)', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue({ id: 'draft-1', organizationId: 'org-1' });

      await request(app.getHttpServer())
        .patch('/api/invoices/drafts/draft-1')
        .set('Authorization', authHeader({ role: 'MANAGER', organizationId: 'org-1' }))
        .send({ storageObjectId: 'obj-2' })
        .expect(400);
      expect(prisma.invoiceDraft.update).not.toHaveBeenCalled();
    });

    it('PATCH :id com null limpa campos nullable; campo ausente não é tocado (Fase 6.8)', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue({ id: 'draft-1', organizationId: 'org-1' });
      prisma.invoiceDraft.update.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'draft-1', ...data }),
      );

      const response = await request(app.getHttpServer())
        .patch('/api/invoices/drafts/draft-1')
        .set('Authorization', authHeader({ role: 'MANAGER', organizationId: 'org-1' }))
        .send({
          supplierId: null,
          categoryId: null,
          number: null,
          issueDate: null,
          dueDate: null,
          totalAmount: null,
          notes: null,
        })
        .expect(200);

      expect(prisma.invoiceDraft.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            supplierId: null,
            categoryId: null,
            number: null,
            issueDate: null,
            dueDate: null,
            totalAmount: null,
            notes: null,
          }),
        }),
      );
      expect(response.body.issueDate).toBeNull();
      expect(response.body.dueDate).toBeNull();
    });

    it('PATCH :id só com um campo não inclui os restantes no update (campo ausente não é alterado)', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue({ id: 'draft-1', organizationId: 'org-1' });
      prisma.invoiceDraft.update.mockResolvedValue({ id: 'draft-1', notes: 'só isto' });

      await request(app.getHttpServer())
        .patch('/api/invoices/drafts/draft-1')
        .set('Authorization', authHeader({ role: 'MANAGER', organizationId: 'org-1' }))
        .send({ notes: 'só isto' })
        .expect(200);

      const data = prisma.invoiceDraft.update.mock.calls[0][0].data;
      expect(data.supplierId).toBeUndefined();
      expect(data.issueDate).toBeUndefined();
      expect(data.dueDate).toBeUndefined();
    });

    it('DELETE :id como MANAGER → 200', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue({ id: 'draft-1', organizationId: 'org-1' });

      await request(app.getHttpServer())
        .delete('/api/invoices/drafts/draft-1')
        .set('Authorization', authHeader({ role: 'MANAGER', organizationId: 'org-1' }))
        .expect(200);

      expect(prisma.invoiceDraft.delete).toHaveBeenCalledWith({ where: { id: 'draft-1' } });
    });
  });

  describe('isolamento entre organizações', () => {
    it('StorageObject de outra organização → 404 na criação do draft', async () => {
      prisma.storageObject.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/invoices/drafts')
        .set('Authorization', authHeader({ role: 'MANAGER', organizationId: 'org-1' }))
        .send({ storageObjectId: 'obj-de-outra-org' })
        .expect(404);
    });

    it('GET :id de draft de outra organização → 404', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/invoices/drafts/draft-de-outra-org')
        .set('Authorization', authHeader({ organizationId: 'org-1' }))
        .expect(404);
    });
  });

  describe('GET :id/fiscal-parsing (Fase 6.7)', () => {
    it('sem token → 401', async () => {
      await request(app.getHttpServer())
        .get('/api/invoices/drafts/draft-1/fiscal-parsing')
        .expect(401);
    });

    it('draft inexistente → 404', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/invoices/drafts/draft-x/fiscal-parsing')
        .set('Authorization', authHeader({ organizationId: 'org-1' }))
        .expect(404);
    });

    it('draft de outra organização → 404 (isolamento)', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/invoices/drafts/draft-de-outra-org/fiscal-parsing')
        .set('Authorization', authHeader({ organizationId: 'org-1' }))
        .expect(404);
    });

    it('draft sem ocrText → 400', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue({
        id: 'draft-1',
        organizationId: 'org-1',
        ocrText: null,
      });

      await request(app.getHttpServer())
        .get('/api/invoices/drafts/draft-1/fiscal-parsing')
        .set('Authorization', authHeader({ organizationId: 'org-1' }))
        .expect(400);
    });

    it('draft com ocrText vazio (só espaços) → 400', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue({
        id: 'draft-1',
        organizationId: 'org-1',
        ocrText: '   ',
      });

      await request(app.getHttpServer())
        .get('/api/invoices/drafts/draft-1/fiscal-parsing')
        .set('Authorization', authHeader({ organizationId: 'org-1' }))
        .expect(400);
    });

    it('MEMBER consegue consultar (sem restrição de role, mesmo alcance de GET :id)', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue({
        id: 'draft-1',
        organizationId: 'org-1',
        ocrText: 'Fornecedor: ACME Lda\nNIF: 123456789\nTotal a Pagar: 100,00€',
      });

      const response = await request(app.getHttpServer())
        .get('/api/invoices/drafts/draft-1/fiscal-parsing')
        .set('Authorization', authHeader({ role: 'MEMBER', organizationId: 'org-1' }))
        .expect(200);

      expect(response.body.supplier.value.name).toBe('ACME Lda');
      expect(response.body.supplierTaxId.value).toBe('123456789');
      expect(response.body.confidence).toBeGreaterThan(0);
    });

    it('não persiste nada — resultado transitório, sem escrita no InvoiceDraft', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue({
        id: 'draft-1',
        organizationId: 'org-1',
        ocrText: 'Fornecedor: ACME Lda',
      });

      await request(app.getHttpServer())
        .get('/api/invoices/drafts/draft-1/fiscal-parsing')
        .set('Authorization', authHeader({ organizationId: 'org-1' }))
        .expect(200);

      expect(prisma.invoiceDraft.update).not.toHaveBeenCalled();
    });

    it('chamadas repetidas são idempotentes — mesmo resultado', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue({
        id: 'draft-1',
        organizationId: 'org-1',
        ocrText: 'Fornecedor: ACME Lda\nTotal a Pagar: 50,00€',
      });

      const first = await request(app.getHttpServer())
        .get('/api/invoices/drafts/draft-1/fiscal-parsing')
        .set('Authorization', authHeader({ organizationId: 'org-1' }))
        .expect(200);
      const second = await request(app.getHttpServer())
        .get('/api/invoices/drafts/draft-1/fiscal-parsing')
        .set('Authorization', authHeader({ organizationId: 'org-1' }))
        .expect(200);

      expect(second.body.supplier).toEqual(first.body.supplier);
      expect(second.body.totals).toEqual(first.body.totals);
    });

    describe('Hardening pós-validação manual — documentos reais adicionais (formatos de número de fatura)', () => {
      it('"Coca-Cola" — extrai "ZFRC B036/9823519819" de "Fatura/Recibo : ..." (sem sub-rótulo "N.º")', async () => {
        prisma.invoiceDraft.findFirst.mockResolvedValue({
          id: 'draft-1',
          organizationId: 'org-1',
          ocrText:
            'Coca-Cola Europacific Partners Portugal, Unipessoal Lda\n' +
            'Fatura/Recibo : ZFRC B036/9823519819\n' +
            'Data : 29-05-2025\nTotal: 145,54€',
        });

        const response = await request(app.getHttpServer())
          .get('/api/invoices/drafts/draft-1/fiscal-parsing')
          .set('Authorization', authHeader({ organizationId: 'org-1' }))
          .expect(200);

        expect(response.body.invoice.number.value).toBe('ZFRC B036/9823519819');
      });

      it('"Farmácia Esperança" — extrai "FR U006/46931" de "Número: ..." (sem a palavra "fatura" próxima)', async () => {
        prisma.invoiceDraft.findFirst.mockResolvedValue({
          id: 'draft-1',
          organizationId: 'org-1',
          ocrText: 'Fornecedor: FARMACIA ESPERANÇA\nNIF: 509978142\nNúmero: FR U006/46931\nData: 11/07/2026\nTotal: 109,55€',
        });

        const response = await request(app.getHttpServer())
          .get('/api/invoices/drafts/draft-1/fiscal-parsing')
          .set('Authorization', authHeader({ organizationId: 'org-1' }))
          .expect(200);

        expect(response.body.invoice.number.value).toBe('FR U006/46931');
      });

      it('"Farmácia Esperança" — variante ortográfica "facturas"/"factura" também reconhecida ("Fatura-Recibo N.:")', async () => {
        prisma.invoiceDraft.findFirst.mockResolvedValue({
          id: 'draft-1',
          organizationId: 'org-1',
          ocrText: 'FATURA-RECIBO N.: FR U006/46931\nData: 11/07/2026',
        });

        const response = await request(app.getHttpServer())
          .get('/api/invoices/drafts/draft-1/fiscal-parsing')
          .set('Authorization', authHeader({ organizationId: 'org-1' }))
          .expect(200);

        expect(response.body.invoice.number.value).toBe('FR U006/46931');
      });

      it('nunca confunde "Documento Int.: 8661869752" (referência interna, "Coca-Cola") com o número real quando ambos aparecem no mesmo texto', async () => {
        prisma.invoiceDraft.findFirst.mockResolvedValue({
          id: 'draft-1',
          organizationId: 'org-1',
          ocrText:
            'Fatura/Recibo : ZFRC B036/9823519819\n' +
            'Documento Int.: 8661869752 Data: 29-05-2025 Total: 145,54',
        });

        const response = await request(app.getHttpServer())
          .get('/api/invoices/drafts/draft-1/fiscal-parsing')
          .set('Authorization', authHeader({ organizationId: 'org-1' }))
          .expect(200);

        expect(response.body.invoice.number.value).toBe('ZFRC B036/9823519819');
      });
    });
  });

  describe('promoção', () => {
    it('promoção com campos obrigatórios em falta → 400', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue({
        id: 'draft-1',
        organizationId: 'org-1',
        supplierId: null,
        issueDate: null,
        totalAmount: null,
      });

      await request(app.getHttpServer())
        .post('/api/invoices/drafts/draft-1/promote')
        .set('Authorization', authHeader({ role: 'MANAGER', organizationId: 'org-1' }))
        .expect(400);
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('promoção bem-sucedida → 201, devolve a Invoice criada; draft deixa de existir, InvoiceAttachment criado', async () => {
      prisma.invoiceDraft.findFirst.mockResolvedValue({
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
      });
      prisma.supplier.findFirst.mockResolvedValue({ id: 'sup-1', organizationId: 'org-1' });
      prisma.expenseCategory.findFirst.mockResolvedValue({ id: 'cat-1', organizationId: 'org-1' });
      prisma.invoice.create.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'inv-1', ...data }),
      );
      prisma.invoiceAttachment.create.mockResolvedValue({ id: 'att-1' });
      prisma.invoiceDraft.delete.mockResolvedValue({ id: 'draft-1' });

      const response = await request(app.getHttpServer())
        .post('/api/invoices/drafts/draft-1/promote')
        .set('Authorization', authHeader({ role: 'MANAGER', organizationId: 'org-1' }))
        .expect(201);

      expect(response.body.id).toBe('inv-1');
      expect(response.body.organizationId).toBe('org-1');
      expect(prisma.invoiceAttachment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ invoiceId: 'inv-1', storageObjectId: 'obj-1' }),
        }),
      );
      expect(prisma.invoiceDraft.delete).toHaveBeenCalledWith({ where: { id: 'draft-1' } });
    });

    describe('Hardening pós-validação manual — documentos "FATURA-RECIBO" sem data de vencimento', () => {
      it('promove com sucesso sem dueDate — dueDate nunca é campo obrigatório (documentos FATURA-RECIBO tipicamente não têm vencimento)', async () => {
        prisma.invoiceDraft.findFirst.mockResolvedValue({
          id: 'draft-1',
          organizationId: 'org-1',
          storageObjectId: 'obj-1',
          supplierId: 'sup-1',
          categoryId: 'cat-1',
          number: 'ZFRC B036/9823519819',
          issueDate: new Date('2025-05-29'),
          dueDate: null,
          totalAmount: 145.54,
          notes: null,
        });
        prisma.supplier.findFirst.mockResolvedValue({ id: 'sup-1', organizationId: 'org-1' });
        prisma.expenseCategory.findFirst.mockResolvedValue({ id: 'cat-1', organizationId: 'org-1' });
        prisma.invoice.create.mockImplementation(
          ({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'inv-1', ...data }),
        );
        prisma.invoiceAttachment.create.mockResolvedValue({ id: 'att-1' });
        prisma.invoiceDraft.delete.mockResolvedValue({ id: 'draft-1' });

        const response = await request(app.getHttpServer())
          .post('/api/invoices/drafts/draft-1/promote')
          .set('Authorization', authHeader({ role: 'MANAGER', organizationId: 'org-1' }))
          .expect(201);

        expect(response.body.dueDate).toBeNull();
        expect(prisma.invoice.create).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ dueDate: null }) }),
        );
      });
    });
  });
});
