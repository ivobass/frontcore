import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp } from './utils/bootstrap-app';
import { authHeader } from './utils/auth';
import type { MockPrismaService } from './utils/mock-prisma';

describe('Invoices (e2e)', () => {
  let app: INestApplication;
  let prisma: MockPrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('autenticação', () => {
    it('GET /api/invoices sem token → 401', async () => {
      await request(app.getHttpServer()).get('/api/invoices').expect(401);
    });
  });

  describe('roles', () => {
    it('POST /api/invoices como MEMBER → 403', async () => {
      await request(app.getHttpServer())
        .post('/api/invoices')
        .set('Authorization', authHeader({ role: 'MEMBER' }))
        .send({
          supplierId: 'sup-1',
          issueDate: '2026-07-01',
          items: [{ description: 'x', unitPrice: 1 }],
        })
        .expect(403);
    });

    it('POST /api/invoices como MANAGER, fatura válida → 201 com total calculado', async () => {
      prisma.supplier.findFirst.mockResolvedValue({ id: 'sup-1', organizationId: 'org-1' });
      prisma.invoice.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'inv-1', ...data }),
      );

      const response = await request(app.getHttpServer())
        .post('/api/invoices')
        .set('Authorization', authHeader({ role: 'MANAGER', organizationId: 'org-1' }))
        .send({
          supplierId: 'sup-1',
          issueDate: '2026-07-01',
          items: [{ description: 'Item A', quantity: 2, unitPrice: 10 }],
        })
        .expect(201);

      expect(response.body.totalAmount).toBe(20);
    });
  });

  describe('isolamento por organização', () => {
    it('POST /api/invoices com fornecedor de outra organização → 404', async () => {
      prisma.supplier.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/invoices')
        .set('Authorization', authHeader({ role: 'MANAGER', organizationId: 'org-1' }))
        .send({
          supplierId: 'sup-x',
          issueDate: '2026-07-01',
          items: [{ description: 'x', unitPrice: 1 }],
        })
        .expect(404);
    });

    it('GET /api/invoices/:id de outra organização → 404', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/invoices/inv-1')
        .set('Authorization', authHeader({ organizationId: 'org-1' }))
        .expect(404);

      expect(prisma.invoice.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'inv-1', organizationId: 'org-1' } }),
      );
    });
  });

  describe('paginação e filtros', () => {
    it('GET /api/invoices devolve o envelope paginado', async () => {
      prisma.invoice.findMany.mockResolvedValue([]);
      prisma.invoice.count.mockResolvedValue(0);

      const response = await request(app.getHttpServer())
        .get('/api/invoices')
        .set('Authorization', authHeader())
        .expect(200);

      expect(response.body).toEqual({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 0,
      });
    });

    it('GET /api/invoices?status=PAID filtra por estado', async () => {
      prisma.invoice.findMany.mockResolvedValue([]);
      prisma.invoice.count.mockResolvedValue(0);

      await request(app.getHttpServer())
        .get('/api/invoices?status=PAID')
        .set('Authorization', authHeader())
        .expect(200);

      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'PAID' }) }),
      );
    });
  });

  describe('erros esperados', () => {
    it('POST /api/invoices sem items → 400', async () => {
      await request(app.getHttpServer())
        .post('/api/invoices')
        .set('Authorization', authHeader({ role: 'MANAGER' }))
        .send({ supplierId: 'sup-1', issueDate: '2026-07-01' })
        .expect(400);
    });

    it('GET /api/invoices?status=INVALIDO → 400', async () => {
      await request(app.getHttpServer())
        .get('/api/invoices?status=INVALIDO')
        .set('Authorization', authHeader())
        .expect(400);
    });
  });
});
