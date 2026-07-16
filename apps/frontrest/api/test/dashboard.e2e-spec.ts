import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp } from './utils/bootstrap-app';
import { authHeader } from './utils/auth';
import type { MockPrismaService } from './utils/mock-prisma';

function mockEmptyAggregations(prisma: MockPrismaService) {
  prisma.invoice.aggregate.mockResolvedValue({
    _count: 0,
    _sum: { totalAmount: null },
    _avg: { totalAmount: null },
  });
  prisma.invoice.count.mockResolvedValue(0);
  prisma.invoice.groupBy.mockResolvedValue([]);
  prisma.invoice.findMany.mockResolvedValue([]);
  prisma.expenseCategory.findMany.mockResolvedValue([]);
  prisma.supplier.findMany.mockResolvedValue([]);
}

describe('Dashboard (e2e)', () => {
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

  beforeEach(() => {
    mockEmptyAggregations(prisma);
  });

  describe('autenticação', () => {
    it('GET /api/dashboard/financial-summary sem token → 401', async () => {
      await request(app.getHttpServer()).get('/api/dashboard/financial-summary').expect(401);
    });
  });

  describe('isolamento por organização', () => {
    it('a organização usada nas queries vem sempre da identidade autenticada, nunca de um parâmetro do pedido', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/financial-summary')
        .set('Authorization', authHeader({ organizationId: 'org-a' }))
        .expect(200);

      expect(prisma.invoice.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-a' }) }),
      );
    });

    it('duas organizações diferentes produzem queries com organizationId diferente (nunca fuga de dados entre pedidos)', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/financial-summary')
        .set('Authorization', authHeader({ organizationId: 'org-a' }))
        .expect(200);
      const firstCallOrgId = prisma.invoice.aggregate.mock.calls[0][0].where.organizationId;

      jest.clearAllMocks();
      mockEmptyAggregations(prisma);

      await request(app.getHttpServer())
        .get('/api/dashboard/financial-summary')
        .set('Authorization', authHeader({ organizationId: 'org-b' }))
        .expect(200);
      const secondCallOrgId = prisma.invoice.aggregate.mock.calls[0][0].where.organizationId;

      expect(firstCallOrgId).toBe('org-a');
      expect(secondCallOrgId).toBe('org-b');
      expect(firstCallOrgId).not.toBe(secondCallOrgId);
    });

    it('qualquer role autenticada (MEMBER incluído) consegue ler o resumo — mesmo alcance de GET /invoices', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/financial-summary')
        .set('Authorization', authHeader({ role: 'MEMBER' }))
        .expect(200);
    });
  });

  describe('filtro temporal', () => {
    it('aceita from/to em YYYY-MM-DD e devolve-os no contrato', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/dashboard/financial-summary?from=2026-07-01&to=2026-07-31')
        .set('Authorization', authHeader())
        .expect(200);

      expect(response.body.period).toEqual({ from: '2026-07-01', to: '2026-07-31' });
    });

    it('rejeita from em formato DD/MM/YYYY (não ISO) com 400', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/financial-summary?from=15/07/2026')
        .set('Authorization', authHeader())
        .expect(400);
    });

    it('rejeita from posterior a to com 400', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/financial-summary?from=2026-07-31&to=2026-07-01')
        .set('Authorization', authHeader())
        .expect(400);
    });

    it('rejeita uma data de calendário impossível (30 de fevereiro) com 400', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/financial-summary?from=2026-02-30')
        .set('Authorization', authHeader())
        .expect(400);
    });

    it('o limite inicial do período fica à meia-noite UTC do próprio "from" (inclusivo)', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/financial-summary?from=2026-07-01&to=2026-07-31')
        .set('Authorization', authHeader())
        .expect(200);

      const { where } = prisma.invoice.aggregate.mock.calls[0][0];
      expect(where.issueDate.gte.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    });

    it('o limite final é exclusivo, um dia depois de "to" (nunca corta o próprio dia 31)', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/financial-summary?from=2026-07-01&to=2026-07-31')
        .set('Authorization', authHeader())
        .expect(200);

      const { where } = prisma.invoice.aggregate.mock.calls[0][0];
      expect(where.issueDate.lt.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    });
  });

  describe('resposta vazia válida', () => {
    it('período sem nenhuma fatura devolve 200 com zeros e arrays vazios, nunca erro', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/dashboard/financial-summary?from=2020-01-01&to=2020-01-31')
        .set('Authorization', authHeader())
        .expect(200);

      expect(response.body.totals).toEqual({
        invoiceCount: 0,
        activeInvoiceCount: 0,
        cancelledInvoiceCount: 0,
        totalAmount: '0.00',
        averageAmount: '0.00',
      });
      expect(response.body.byStatus).toEqual([]);
      expect(response.body.monthlyTrend).toEqual([]);
      expect(response.body.byCategory).toEqual([]);
      expect(response.body.topSuppliers).toEqual([]);
    });
  });

  describe('contrato básico', () => {
    it('devolve as chaves de topo esperadas', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/dashboard/financial-summary')
        .set('Authorization', authHeader())
        .expect(200);

      expect(Object.keys(response.body).sort()).toEqual(
        ['byCategory', 'byStatus', 'monthlyTrend', 'period', 'topSuppliers', 'totals'].sort(),
      );
    });
  });
});
