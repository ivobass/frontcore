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

  describe('Fase 8.9 — GET /dashboard/financial-insights', () => {
    it('sem token → 401', async () => {
      await request(app.getHttpServer()).get('/api/dashboard/financial-insights').expect(401);
    });

    it('período vazio devolve insights vazios (nulls/zeros), nunca erro', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/dashboard/financial-insights?from=2020-01-01&to=2020-01-31')
        .set('Authorization', authHeader())
        .expect(200);

      expect(response.body.largestSupplier).toBeNull();
      expect(response.body.largestCategory).toBeNull();
      // topN reflete a quantidade efetivamente considerada (correção
      // pós-revisão, Fase 8.9) — 0 sem nenhum fornecedor no período,
      // nunca o limite configurado (3) quando não há dados reais.
      expect(response.body.supplierConcentration).toEqual({ topN: 0, share: null });
      expect(response.body.outstanding).toEqual({ count: 0, totalAmount: '0.00' });
      expect(response.body.largestExpense).toEqual({ invoice: null });
      expect(response.body.trend.direction).toBe('insufficient_data');
    });

    it('a organização usada nas queries vem sempre da identidade autenticada — isolamento confirmado', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/financial-insights')
        .set('Authorization', authHeader({ organizationId: 'org-a' }))
        .expect(200);

      expect(prisma.invoice.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-a' }) }),
      );
      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-a' }) }),
      );
    });

    it('com dados reais, devolve concentração/ranking/maior fatura calculados a partir dos mesmos agregados de financial-summary', async () => {
      prisma.invoice.aggregate.mockResolvedValue({
        _count: 3,
        _sum: { totalAmount: '600.00' },
        _avg: { totalAmount: '200.00' },
      });
      prisma.invoice.groupBy.mockImplementation((args: { by: string[] }) => {
        if (args.by[0] === 'status') {
          return Promise.resolve([{ status: 'PENDING', _count: 3, _sum: { totalAmount: '600.00' } }]);
        }
        if (args.by[0] === 'supplierId') {
          return Promise.resolve([{ supplierId: 'sup-1', _count: 3, _sum: { totalAmount: '600.00' } }]);
        }
        if (args.by[0] === 'categoryId') {
          return Promise.resolve([{ categoryId: 'cat-1', _count: 3, _sum: { totalAmount: '600.00' } }]);
        }
        return Promise.resolve([]);
      });
      prisma.invoice.findMany.mockImplementation((args: { select?: { issueDate?: boolean }; include?: unknown }) => {
        if (args.include) {
          // getLargestInvoices() — única chamada com `include`, nunca `select`.
          return Promise.resolve([
            {
              id: 'inv-1',
              issueDate: new Date('2026-07-20T00:00:00.000Z'),
              status: 'PENDING',
              totalAmount: '300.00',
              supplier: { name: 'Hetzner' },
              category: { name: 'Hosting' },
            },
          ]);
        }
        if (args.select?.issueDate) {
          return Promise.resolve([{ issueDate: new Date('2026-07-05T00:00:00.000Z'), totalAmount: '600.00' }]);
        }
        return Promise.resolve([]);
      });
      prisma.supplier.findMany.mockResolvedValue([{ id: 'sup-1', name: 'Hetzner' }]);
      prisma.expenseCategory.findMany.mockResolvedValue([{ id: 'cat-1', name: 'Hosting' }]);

      const response = await request(app.getHttpServer())
        .get('/api/dashboard/financial-insights?from=2026-07-01&to=2026-07-31')
        .set('Authorization', authHeader())
        .expect(200);

      expect(response.body.largestSupplier).toMatchObject({ supplierId: 'sup-1', supplierName: 'Hetzner', share: '100.00' });
      expect(response.body.largestExpense.invoice).toMatchObject({ id: 'inv-1', supplierName: 'Hetzner', totalAmount: '300.00' });
    });
  });

  describe('Fase 8.11 — GET /dashboard/financial-analysis', () => {
    it('sem token → 401', async () => {
      await request(app.getHttpServer()).get('/api/dashboard/financial-analysis').expect(401);
    });

    it('a organização usada nas queries vem sempre da identidade autenticada, nunca de um parâmetro do pedido', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/financial-analysis')
        .set('Authorization', authHeader({ organizationId: 'org-a' }))
        .expect(200);

      expect(prisma.invoice.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-a' }) }),
      );
      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-a' }) }),
      );
    });

    it('duas organizações diferentes produzem queries com organizationId diferente (isolamento multi-tenant)', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/financial-analysis')
        .set('Authorization', authHeader({ organizationId: 'org-a' }))
        .expect(200);
      const firstCallOrgId = prisma.invoice.aggregate.mock.calls[0][0].where.organizationId;

      jest.clearAllMocks();
      mockEmptyAggregations(prisma);

      await request(app.getHttpServer())
        .get('/api/dashboard/financial-analysis')
        .set('Authorization', authHeader({ organizationId: 'org-b' }))
        .expect(200);
      const secondCallOrgId = prisma.invoice.aggregate.mock.calls[0][0].where.organizationId;

      expect(firstCallOrgId).toBe('org-a');
      expect(secondCallOrgId).toBe('org-b');
      expect(firstCallOrgId).not.toBe(secondCallOrgId);
    });

    it('período (from/to) é propagado a getFinancialSummary() e getLargestInvoices()', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/financial-analysis?from=2026-07-01&to=2026-07-31')
        .set('Authorization', authHeader())
        .expect(200);

      expect(prisma.invoice.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            issueDate: { gte: new Date('2026-07-01T00:00:00.000Z'), lt: new Date('2026-08-01T00:00:00.000Z') },
          }),
        }),
      );
      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            issueDate: { gte: new Date('2026-07-01T00:00:00.000Z'), lt: new Date('2026-08-01T00:00:00.000Z') },
          }),
        }),
      );
    });

    it('período vazio devolve insights vazios e analysis.results: [], nunca erro', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/dashboard/financial-analysis?from=2020-01-01&to=2020-01-31')
        .set('Authorization', authHeader())
        .expect(200);

      expect(response.body.insights.largestSupplier).toBeNull();
      expect(response.body.insights.trend.direction).toBe('insufficient_data');
      expect(response.body.analysis.results).toEqual([]);
      expect(response.body.analysis.metadata).toEqual({
        analysesRun: ['monthly_trend', 'relative_concentration'],
        conclusionsProduced: 0,
      });
    });

    it('com dados reais, devolve { insights, analysis } com a união discriminada serializada corretamente', async () => {
      prisma.invoice.aggregate.mockResolvedValue({
        _count: 3,
        _sum: { totalAmount: '1000.00' },
        _avg: { totalAmount: '333.33' },
      });
      prisma.invoice.groupBy.mockImplementation((args: { by: string[] }) => {
        if (args.by[0] === 'status') {
          return Promise.resolve([{ status: 'PENDING', _count: 3, _sum: { totalAmount: '1000.00' } }]);
        }
        if (args.by[0] === 'supplierId') {
          return Promise.resolve([{ supplierId: 'sup-1', _count: 3, _sum: { totalAmount: '600.00' } }]);
        }
        if (args.by[0] === 'categoryId') {
          return Promise.resolve([{ categoryId: 'cat-1', _count: 3, _sum: { totalAmount: '400.00' } }]);
        }
        return Promise.resolve([]);
      });
      prisma.invoice.findMany.mockImplementation((args: { select?: { issueDate?: boolean }; include?: unknown }) => {
        if (args.include) {
          // getLargestInvoices() — única chamada com `include`, nunca `select`.
          return Promise.resolve([]);
        }
        if (args.select?.issueDate) {
          // Dois meses consecutivos com dados — monthly_trend fica aplicável (increase).
          return Promise.resolve([
            { issueDate: new Date('2026-06-15T00:00:00.000Z'), totalAmount: '800.00' },
            { issueDate: new Date('2026-07-05T00:00:00.000Z'), totalAmount: '1000.00' },
          ]);
        }
        return Promise.resolve([]);
      });
      prisma.supplier.findMany.mockResolvedValue([{ id: 'sup-1', name: 'Hetzner' }]);
      prisma.expenseCategory.findMany.mockResolvedValue([{ id: 'cat-1', name: 'Hosting' }]);

      const response = await request(app.getHttpServer())
        .get('/api/dashboard/financial-analysis?from=2026-07-01&to=2026-07-31')
        .set('Authorization', authHeader())
        .expect(200);

      expect(response.body.insights.largestSupplier).toMatchObject({ supplierId: 'sup-1', supplierName: 'Hetzner' });
      expect(response.body.analysis.results.map((r: { id: string }) => r.id).sort()).toEqual([
        'monthly_trend',
        'relative_concentration',
      ]);
      const trendResult = response.body.analysis.results.find((r: { id: string }) => r.id === 'monthly_trend');
      expect(trendResult).toMatchObject({ conclusion: 'increase' });
      expect(trendResult.evidence).toMatchObject({ current: '1000.00', previous: '800.00' });
      const concentrationResult = response.body.analysis.results.find(
        (r: { id: string }) => r.id === 'relative_concentration',
      );
      expect(concentrationResult).toMatchObject({ conclusion: 'supplier_more_concentrated' });
      expect(concentrationResult.evidence).toEqual({
        supplierShare: '60.00',
        supplierTopN: 1,
        categoryShare: '40.00',
        categoryTopN: 1,
      });
    });
  });
});
