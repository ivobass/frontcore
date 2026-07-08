import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp } from './utils/bootstrap-app';
import { authHeader } from './utils/auth';
import type { MockPrismaService } from './utils/mock-prisma';
import type { MockObjectStorage } from './utils/mock-object-storage';

describe('Invoice Attachments (e2e)', () => {
  let app: INestApplication;
  let prisma: MockPrismaService;
  let storage: MockObjectStorage;

  beforeAll(async () => {
    ({ app, prisma, storage } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function mockInvoiceFound() {
    prisma.invoice.findFirst.mockResolvedValue({
      id: 'inv-1',
      organizationId: 'org-1',
      supplier: {},
      category: null,
      items: [],
    });
  }

  describe('autenticação', () => {
    it('POST /api/invoices/:invoiceId/attachments sem token → 401', async () => {
      await request(app.getHttpServer())
        .post('/api/invoices/inv-1/attachments')
        .attach('file', Buffer.from('conteudo'), {
          filename: 'a.pdf',
          contentType: 'application/pdf',
        })
        .expect(401);
    });
  });

  describe('roles', () => {
    it('POST como MEMBER → 403', async () => {
      await request(app.getHttpServer())
        .post('/api/invoices/inv-1/attachments')
        .set('Authorization', authHeader({ role: 'MEMBER' }))
        .attach('file', Buffer.from('conteudo'), {
          filename: 'a.pdf',
          contentType: 'application/pdf',
        })
        .expect(403);
    });

    it('DELETE como MEMBER → 403', async () => {
      await request(app.getHttpServer())
        .delete('/api/invoices/inv-1/attachments/att-1')
        .set('Authorization', authHeader({ role: 'MEMBER' }))
        .expect(403);
    });
  });

  describe('criação', () => {
    it('POST válido como MANAGER → 201, reutiliza o fluxo real de upload', async () => {
      mockInvoiceFound();
      prisma.storageObject.create.mockResolvedValue({
        id: 'obj-1',
        organizationId: 'org-1',
        key: null,
        filename: 'fatura.pdf',
        contentType: 'application/pdf',
        size: 8,
      });
      storage.put.mockResolvedValue({});
      prisma.storageObject.update.mockImplementation(
        ({ data }: { data: { key: string } }) =>
          Promise.resolve({
            id: 'obj-1',
            organizationId: 'org-1',
            key: data.key,
            filename: 'fatura.pdf',
            contentType: 'application/pdf',
            size: 8,
          }),
      );
      prisma.invoiceAttachment.create.mockImplementation(
        ({ data }: { data: { storageObjectId: string; invoiceId: string } }) =>
          Promise.resolve({
            id: 'att-1',
            invoiceId: data.invoiceId,
            storageObjectId: data.storageObjectId,
            storageObject: {
              id: data.storageObjectId,
              filename: 'fatura.pdf',
              contentType: 'application/pdf',
              size: 8,
            },
          }),
      );

      const response = await request(app.getHttpServer())
        .post('/api/invoices/inv-1/attachments')
        .set('Authorization', authHeader({ role: 'MANAGER', organizationId: 'org-1' }))
        .attach('file', Buffer.from('conteudo'), {
          filename: 'fatura.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      expect(response.body.id).toBe('att-1');
      expect(storage.put).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'organizations/org-1/uploads/obj-1' }),
      );
    });

    it('POST para fatura de outra organização → 404, sem tocar em storage', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/invoices/inv-x/attachments')
        .set('Authorization', authHeader({ role: 'MANAGER', organizationId: 'org-1' }))
        .attach('file', Buffer.from('conteudo'), {
          filename: 'a.pdf',
          contentType: 'application/pdf',
        })
        .expect(404);
      expect(storage.put).not.toHaveBeenCalled();
    });

    it('POST com MIME não permitido → 400', async () => {
      mockInvoiceFound();

      await request(app.getHttpServer())
        .post('/api/invoices/inv-1/attachments')
        .set('Authorization', authHeader({ role: 'MANAGER' }))
        .attach('file', Buffer.from('conteudo'), { filename: 'a.txt', contentType: 'text/plain' })
        .expect(400);
      expect(storage.put).not.toHaveBeenCalled();
    });
  });

  describe('listagem', () => {
    it('GET lista os anexos da fatura', async () => {
      mockInvoiceFound();
      prisma.invoiceAttachment.findMany.mockResolvedValue([
        { id: 'att-1', storageObject: { filename: 'fatura.pdf' } },
      ]);

      const response = await request(app.getHttpServer())
        .get('/api/invoices/inv-1/attachments')
        .set('Authorization', authHeader({ organizationId: 'org-1' }))
        .expect(200);

      expect(response.body).toHaveLength(1);
    });

    it('GET de fatura de outra organização → 404', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/invoices/inv-x/attachments')
        .set('Authorization', authHeader({ organizationId: 'org-1' }))
        .expect(404);
    });
  });

  describe('download de um anexo', () => {
    it('GET :id devolve metadados + downloadUrl, id é o do anexo', async () => {
      prisma.invoiceAttachment.findFirst.mockResolvedValue({
        id: 'att-1',
        invoiceId: 'inv-1',
        organizationId: 'org-1',
        storageObjectId: 'obj-1',
      });
      prisma.storageObject.findFirst.mockResolvedValue({
        id: 'obj-1',
        organizationId: 'org-1',
        key: 'organizations/org-1/uploads/obj-1',
        filename: 'fatura.pdf',
      });
      storage.getDownloadUrl.mockResolvedValue('https://signed.example/obj-1');

      const response = await request(app.getHttpServer())
        .get('/api/invoices/inv-1/attachments/att-1')
        .set('Authorization', authHeader({ organizationId: 'org-1' }))
        .expect(200);

      expect(response.body.id).toBe('att-1');
      expect(response.body.storageObjectId).toBe('obj-1');
      expect(response.body.downloadUrl).toBe('https://signed.example/obj-1');
    });

    it('GET :id de anexo inexistente → 404', async () => {
      prisma.invoiceAttachment.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/invoices/inv-1/attachments/att-x')
        .set('Authorization', authHeader({ organizationId: 'org-1' }))
        .expect(404);
    });
  });

  describe('eliminação', () => {
    it('DELETE como MANAGER → remove o InvoiceAttachment e reutiliza uploadsService.remove()', async () => {
      prisma.invoiceAttachment.findFirst.mockResolvedValue({
        id: 'att-1',
        invoiceId: 'inv-1',
        organizationId: 'org-1',
        storageObjectId: 'obj-1',
      });
      prisma.storageObject.findFirst.mockResolvedValue({
        id: 'obj-1',
        organizationId: 'org-1',
        key: 'organizations/org-1/uploads/obj-1',
      });

      await request(app.getHttpServer())
        .delete('/api/invoices/inv-1/attachments/att-1')
        .set('Authorization', authHeader({ role: 'MANAGER', organizationId: 'org-1' }))
        .expect(200);

      expect(prisma.invoiceAttachment.delete).toHaveBeenCalledWith({ where: { id: 'att-1' } });
      expect(storage.delete).toHaveBeenCalledWith('organizations/org-1/uploads/obj-1');
    });
  });
});
