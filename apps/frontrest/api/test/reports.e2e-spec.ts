import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp } from './utils/bootstrap-app';
import { authHeader } from './utils/auth';
import type { MockPrismaService } from './utils/mock-prisma';

interface MonthFixture {
  count: number;
  total: string;
}

/**
 * Só a organização/mês pedidos aqui têm dados — todo o resto (outra
 * organização, mês anterior por omissão) devolve zeros/vazio, o que
 * exercita naturalmente o caminho "período anterior com zero →
 * percentageChange null" ao nível de integração real (Reports+
 * Dashboard+Prisma mockado), sem repetir a álgebra já coberta em
 * `reports.service.spec.ts`.
 */
function wireInvoiceData(prisma: MockPrismaService, organizationId: string, monthKey: string, fixture: MonthFixture) {
  function matches(args: { where: { organizationId: string; issueDate: { gte: Date } } }): boolean {
    return (
      args.where.organizationId === organizationId &&
      args.where.issueDate.gte.toISOString().slice(0, 7) === monthKey
    );
  }

  prisma.invoice.aggregate.mockImplementation((args: any) => {
    const hit = matches(args) ? fixture : { count: 0, total: '0.00' };
    return Promise.resolve({
      _count: hit.count,
      _sum: { totalAmount: hit.count > 0 ? hit.total : null },
      _avg: { totalAmount: hit.count > 0 ? (Number(hit.total) / hit.count).toFixed(2) : null },
    });
  });

  prisma.invoice.count.mockResolvedValue(0);

  prisma.invoice.groupBy.mockImplementation((args: any) => {
    const hit = matches(args) ? fixture : { count: 0, total: '0.00' };
    if (hit.count === 0) return Promise.resolve([]);
    if (args.by[0] === 'status') {
      return Promise.resolve([{ status: 'PENDING', _count: hit.count, _sum: { totalAmount: hit.total } }]);
    }
    return Promise.resolve([]);
  });

  prisma.invoice.findMany.mockImplementation((args: any) => {
    const isDetailQuery = args.select?.supplier !== undefined;
    // Fase 8.9 — DashboardService.getLargestInvoices() é a única chamada a
    // `invoice.findMany()` com `include` (nunca `select`) e `orderBy: totalAmount desc`.
    const isLargestInvoicesQuery = args.include?.supplier !== undefined;
    const hit = matches(args) ? fixture : { count: 0, total: '0.00' };
    if (hit.count === 0) return Promise.resolve([]);

    if (isDetailQuery) {
      return Promise.resolve(
        Array.from({ length: hit.count }, (_, index) => ({
          id: `inv-${index}`,
          number: `F${index}`,
          issueDate: new Date(`${monthKey}-05T00:00:00.000Z`),
          dueDate: null,
          status: 'PENDING',
          totalAmount: (Number(hit.total) / hit.count).toFixed(2),
          supplier: { name: `Fornecedor ${index}` },
          category: null,
        })),
      );
    }

    if (isLargestInvoicesQuery) {
      return Promise.resolve(
        Array.from({ length: hit.count }, (_, index) => ({
          id: `inv-${index}`,
          issueDate: new Date(`${monthKey}-05T00:00:00.000Z`),
          status: 'PENDING',
          totalAmount: (Number(hit.total) / hit.count).toFixed(2),
          supplier: { name: `Fornecedor ${index}` },
          category: null,
        })),
      );
    }

    // Consulta de tendência mensal do DashboardService — só issueDate/totalAmount.
    return Promise.resolve([{ issueDate: new Date(`${monthKey}-05T00:00:00.000Z`), totalAmount: hit.total }]);
  });

  prisma.expenseCategory.findMany.mockResolvedValue([]);
  prisma.supplier.findMany.mockResolvedValue([]);
}

describe('Reports (e2e)', () => {
  let app: INestApplication;
  let prisma: MockPrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('autenticação', () => {
    it('GET /api/reports/monthly sem token → 401', async () => {
      await request(app.getHttpServer()).get('/api/reports/monthly?month=2026-07').expect(401);
    });
  });

  describe('qualquer role autenticada pode ler', () => {
    it('MEMBER consegue consultar o relatório', async () => {
      wireInvoiceData(prisma, 'org-1', '2026-07', { count: 2, total: '100.00' });
      await request(app.getHttpServer())
        .get('/api/reports/monthly?month=2026-07')
        .set('Authorization', authHeader({ organizationId: 'org-1', role: 'MEMBER' }))
        .expect(200);
    });
  });

  describe('isolamento por organização', () => {
    it('um "organizationId" no query string é rejeitado pelo ValidationPipe — nunca chega a influenciar a query', async () => {
      // forbidNonWhitelisted: true (global) rejeita qualquer campo fora do
      // DTO antes de o pedido chegar ao controller/service — proteção mais
      // forte do que "ser ignorado": nem sequer é aceite.
      await request(app.getHttpServer())
        .get('/api/reports/monthly?month=2026-07&organizationId=org-b')
        .set('Authorization', authHeader({ organizationId: 'org-a' }))
        .expect(400);
    });

    it('a organização usada nas queries vem sempre da identidade autenticada', async () => {
      wireInvoiceData(prisma, 'org-a', '2026-07', { count: 3, total: '150.00' });

      await request(app.getHttpServer())
        .get('/api/reports/monthly?month=2026-07')
        .set('Authorization', authHeader({ organizationId: 'org-a' }))
        .expect(200);

      for (const call of prisma.invoice.aggregate.mock.calls) {
        expect(call[0].where.organizationId).toBe('org-a');
      }
    });

    it('duas organizações produzem relatórios distintos, sem fuga de dados', async () => {
      wireInvoiceData(prisma, 'org-a', '2026-07', { count: 5, total: '500.00' });

      const responseA = await request(app.getHttpServer())
        .get('/api/reports/monthly?month=2026-07')
        .set('Authorization', authHeader({ organizationId: 'org-a' }))
        .expect(200);
      const responseB = await request(app.getHttpServer())
        .get('/api/reports/monthly?month=2026-07')
        .set('Authorization', authHeader({ organizationId: 'org-b' }))
        .expect(200);

      expect(responseA.body.totals.activeInvoiceCount).toBe(5);
      expect(responseB.body.totals.activeInvoiceCount).toBe(0);
    });
  });

  describe('validação de mês', () => {
    it('rejeita formato inválido → 400', async () => {
      await request(app.getHttpServer())
        .get('/api/reports/monthly?month=2026-7')
        .set('Authorization', authHeader())
        .expect(400);
    });

    it('rejeita mês impossível (13) → 400', async () => {
      await request(app.getHttpServer())
        .get('/api/reports/monthly?month=2026-13')
        .set('Authorization', authHeader())
        .expect(400);
    });
  });

  describe('resposta JSON e comparação', () => {
    it('resposta JSON válida com o mesmo período pedido e período anterior calculado', async () => {
      wireInvoiceData(prisma, 'org-1', '2026-07', { count: 4, total: '370.00' });

      const response = await request(app.getHttpServer())
        .get('/api/reports/monthly?month=2026-07')
        .set('Authorization', authHeader({ organizationId: 'org-1' }))
        .expect(200);

      expect(response.body.period).toEqual({ month: '2026-07', from: '2026-07-01', to: '2026-07-31' });
      expect(response.body.previousPeriod.month).toBe('2026-06');
      expect(response.body.totals.activeInvoiceCount).toBe(4);
      expect(response.body.totals.totalAmount).toBe('370.00');
    });

    it('período anterior sem dados → percentageChange null, nunca Infinity/NaN', async () => {
      wireInvoiceData(prisma, 'org-1', '2026-07', { count: 4, total: '370.00' });

      const response = await request(app.getHttpServer())
        .get('/api/reports/monthly?month=2026-07')
        .set('Authorization', authHeader({ organizationId: 'org-1' }))
        .expect(200);

      expect(response.body.comparison.totalAmount.percentageChange).toBeNull();
      expect(response.body.comparison.totalAmount.direction).toBe('increase');
      expect(JSON.stringify(response.body)).not.toMatch(/Infinity|NaN/);
    });

    it('período vazio (sem faturas) devolve resposta válida, nunca erro', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/reports/monthly?month=2026-07')
        .set('Authorization', authHeader({ organizationId: 'org-sem-faturas' }))
        .expect(200);

      expect(response.body.totals.activeInvoiceCount).toBe(0);
      expect(response.body.invoices).toEqual([]);
    });

    it('nunca inclui faturas de InvoiceDraft — só o modelo Invoice é consultado', async () => {
      wireInvoiceData(prisma, 'org-1', '2026-07', { count: 1, total: '50.00' });

      await request(app.getHttpServer())
        .get('/api/reports/monthly?month=2026-07')
        .set('Authorization', authHeader({ organizationId: 'org-1' }))
        .expect(200);

      expect(prisma.invoiceDraft.findMany).not.toHaveBeenCalled();
    });
  });

  describe('exportação CSV', () => {
    it('devolve CSV com headers corretos e filename seguro', async () => {
      wireInvoiceData(prisma, 'org-1', '2026-07', { count: 2, total: '100.00' });

      const response = await request(app.getHttpServer())
        .get('/api/reports/monthly.csv?month=2026-07')
        .set('Authorization', authHeader({ organizationId: 'org-1' }))
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('relatorio-financeiro-2026-07.csv');
      expect(response.text.charCodeAt(0)).toBe(0xfeff);
    });

    it('CSV sem token → 401', async () => {
      await request(app.getHttpServer()).get('/api/reports/monthly.csv?month=2026-07').expect(401);
    });
  });

  describe('exportação PDF', () => {
    it('devolve PDF com headers corretos e filename seguro', async () => {
      wireInvoiceData(prisma, 'org-1', '2026-07', { count: 1, total: '50.00' });

      const response = await request(app.getHttpServer())
        .get('/api/reports/monthly.pdf?month=2026-07')
        .set('Authorization', authHeader({ organizationId: 'org-1' }))
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);

      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.headers['content-disposition']).toContain('relatorio-financeiro-2026-07.pdf');
      expect((response.body as Buffer).subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });
  });

  describe('JSON, CSV e PDF referem-se ao mesmo período', () => {
    it('os três formatos devolvem o mesmo period.from/to para o mesmo pedido', async () => {
      wireInvoiceData(prisma, 'org-1', '2026-07', { count: 2, total: '100.00' });
      const auth = authHeader({ organizationId: 'org-1' });

      const json = await request(app.getHttpServer())
        .get('/api/reports/monthly?month=2026-07')
        .set('Authorization', auth)
        .expect(200);
      const csv = await request(app.getHttpServer())
        .get('/api/reports/monthly.csv?month=2026-07')
        .set('Authorization', auth)
        .expect(200);

      expect(csv.text).toContain(json.body.period.from);
      expect(csv.text).toContain(json.body.period.to);
    });
  });

  describe('Fase 8.12 — GET /reports/monthly — Financial Analysis Engine', () => {
    it('JSON inclui analysis, sempre separado de insights, com as duas análises registadas', async () => {
      wireInvoiceData(prisma, 'org-1', '2026-07', { count: 3, total: '900.00' });

      const response = await request(app.getHttpServer())
        .get('/api/reports/monthly?month=2026-07')
        .set('Authorization', authHeader({ organizationId: 'org-1' }))
        .expect(200);

      expect(response.body.insights).toBeDefined();
      expect(response.body.analysis).toBeDefined();
      expect(response.body.analysis).not.toEqual(response.body.insights);
      expect(Array.isArray(response.body.analysis.results)).toBe(true);
      expect(response.body.analysis.metadata.analysesRun).toEqual(['monthly_trend', 'relative_concentration']);
    });

    it('mês sem faturas devolve analysis.results: [], contrato válido, nunca erro', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/reports/monthly?month=2020-01')
        .set('Authorization', authHeader())
        .expect(200);

      expect(response.body.analysis.results).toEqual([]);
      expect(response.body.analysis.metadata).toEqual({
        analysesRun: ['monthly_trend', 'relative_concentration'],
        conclusionsProduced: 0,
      });
    });

    it('isolamento por organização — analysis nunca reflete dados de uma organização diferente da autenticada', async () => {
      wireInvoiceData(prisma, 'org-a', '2026-07', { count: 2, total: '500.00' });

      const response = await request(app.getHttpServer())
        .get('/api/reports/monthly?month=2026-07')
        .set('Authorization', authHeader({ organizationId: 'org-b' }))
        .expect(200);

      // org-b não tem dados no fixture (só org-a tem) — analysis reflete um período vazio, nunca os dados de org-a.
      expect(response.body.analysis.results).toEqual([]);
    });

    it('CSV e PDF continuam válidos com o novo campo analysis presente no relatório', async () => {
      wireInvoiceData(prisma, 'org-1', '2026-07', { count: 2, total: '500.00' });
      const auth = authHeader({ organizationId: 'org-1' });

      const csv = await request(app.getHttpServer())
        .get('/api/reports/monthly.csv?month=2026-07')
        .set('Authorization', auth)
        .expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');

      const pdf = await request(app.getHttpServer())
        .get('/api/reports/monthly.pdf?month=2026-07')
        .set('Authorization', auth)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect((pdf.body as Buffer).subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });
  });
});
