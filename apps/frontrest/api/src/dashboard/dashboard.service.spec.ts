import { DashboardService } from './dashboard.service';
import { createMockPrismaService } from '../../test/utils/mock-prisma';
import type { MockPrismaService } from '../../test/utils/mock-prisma';

/** Resultado "vazio" partilhado por omissão — cada teste só sobrescreve o que precisa. */
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

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: MockPrismaService;

  beforeEach(() => {
    prisma = createMockPrismaService();
    service = new DashboardService(prisma as never);
    mockEmptyAggregations(prisma);
  });

  describe('isolamento por organização', () => {
    it('inclui organizationId em todas as queries de Invoice', async () => {
      await service.getFinancialSummary('org-1', {});

      for (const call of [
        ...prisma.invoice.aggregate.mock.calls,
        ...prisma.invoice.count.mock.calls,
        ...prisma.invoice.groupBy.mock.calls,
        ...prisma.invoice.findMany.mock.calls,
      ]) {
        expect(call[0].where.organizationId).toBe('org-1');
      }
    });

    it('inclui organizationId nas queries de lookup de nome (categoria/fornecedor)', async () => {
      prisma.invoice.groupBy.mockImplementation(({ by }: { by: string[] }) => {
        if (by[0] === 'categoryId') return Promise.resolve([{ categoryId: 'cat-1', _count: 1, _sum: { totalAmount: 10 } }]);
        if (by[0] === 'supplierId') return Promise.resolve([{ supplierId: 'sup-1', _count: 1, _sum: { totalAmount: 10 } }]);
        return Promise.resolve([]);
      });

      await service.getFinancialSummary('org-1', {});

      expect(prisma.expenseCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1' }) }),
      );
      expect(prisma.supplier.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1' }) }),
      );
    });
  });

  describe('CANCELLED excluído dos totais ativos, contado à parte', () => {
    it('agregação de totais ativos filtra status != CANCELLED', async () => {
      await service.getFinancialSummary('org-1', {});

      expect(prisma.invoice.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: { not: 'CANCELLED' } }) }),
      );
    });

    it('cancelledInvoiceCount vem de uma contagem própria, filtrada por status = CANCELLED', async () => {
      prisma.invoice.count.mockResolvedValue(3);

      const result = await service.getFinancialSummary('org-1', {});

      expect(prisma.invoice.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'CANCELLED' }) }),
      );
      expect(result.totals.cancelledInvoiceCount).toBe(3);
    });

    it('byStatus inclui CANCELLED (nunca escondido), mesmo não entrando nos totais ativos', async () => {
      prisma.invoice.groupBy.mockImplementation(({ by }: { by: string[] }) => {
        if (by[0] === 'status') {
          return Promise.resolve([
            { status: 'PENDING', _count: 2, _sum: { totalAmount: 100 } },
            { status: 'CANCELLED', _count: 1, _sum: { totalAmount: 50 } },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await service.getFinancialSummary('org-1', {});

      expect(result.byStatus).toEqual([
        { status: 'PENDING', count: 2, totalAmount: '100.00' },
        { status: 'CANCELLED', count: 1, totalAmount: '50.00' },
      ]);
    });
  });

  describe('categoria nula', () => {
    it('representa categoryId null como "Sem categoria"', async () => {
      prisma.invoice.groupBy.mockImplementation(({ by }: { by: string[] }) => {
        if (by[0] === 'categoryId') {
          return Promise.resolve([{ categoryId: null, _count: 5, _sum: { totalAmount: 200 } }]);
        }
        return Promise.resolve([]);
      });

      const result = await service.getFinancialSummary('org-1', {});

      expect(result.byCategory).toEqual([
        { categoryId: null, categoryName: 'Sem categoria', count: 5, totalAmount: '200.00' },
      ]);
      // categoryId null nunca é enviado ao lookup de nomes (filtrado antes).
      expect(prisma.expenseCategory.findMany).not.toHaveBeenCalled();
    });
  });

  describe('período sem dados', () => {
    it('devolve zeros e arrays vazios, nunca null/undefined nem erro', async () => {
      const result = await service.getFinancialSummary('org-1', {});

      expect(result.totals).toEqual({
        invoiceCount: 0,
        activeInvoiceCount: 0,
        cancelledInvoiceCount: 0,
        totalAmount: '0.00',
        averageAmount: '0.00',
      });
      expect(result.byStatus).toEqual([]);
      expect(result.monthlyTrend).toEqual([]);
      expect(result.byCategory).toEqual([]);
      expect(result.topSuppliers).toEqual([]);
    });
  });

  describe('cálculo da média', () => {
    it('usa _avg.totalAmount devolvido pelo Prisma, nunca recalculado manualmente', async () => {
      prisma.invoice.aggregate.mockResolvedValue({
        _count: 4,
        _sum: { totalAmount: 400 },
        _avg: { totalAmount: 100 },
      });

      const result = await service.getFinancialSummary('org-1', {});

      expect(result.totals.averageAmount).toBe('100.00');
    });
  });

  describe('principais fornecedores', () => {
    it('pede ordenado por totalAmount desc e limitado a 5 diretamente ao Prisma', async () => {
      await service.getFinancialSummary('org-1', {});

      expect(prisma.invoice.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['supplierId'],
          orderBy: { _sum: { totalAmount: 'desc' } },
          take: 5,
        }),
      );
    });

    it('resolve o nome do fornecedor pelo id, com fallback ao próprio id se não encontrado', async () => {
      prisma.invoice.groupBy.mockImplementation(({ by }: { by: string[] }) => {
        if (by[0] === 'supplierId') {
          return Promise.resolve([{ supplierId: 'sup-1', _count: 3, _sum: { totalAmount: 300 } }]);
        }
        return Promise.resolve([]);
      });
      prisma.supplier.findMany.mockResolvedValue([{ id: 'sup-1', name: 'Acme Lda' }]);

      const result = await service.getFinancialSummary('org-1', {});

      expect(result.topSuppliers).toEqual([
        { supplierId: 'sup-1', supplierName: 'Acme Lda', count: 3, totalAmount: '300.00' },
      ]);
    });
  });

  describe('serialização de montantes', () => {
    it('devolve totalAmount/averageAmount sempre como string, com 2 casas decimais', async () => {
      prisma.invoice.aggregate.mockResolvedValue({
        _count: 1,
        _sum: { totalAmount: '123.4' },
        _avg: { totalAmount: '123.4' },
      });

      const result = await service.getFinancialSummary('org-1', {});

      expect(result.totals.totalAmount).toBe('123.40');
      expect(typeof result.totals.totalAmount).toBe('string');
    });
  });

  describe('validação de período', () => {
    it('propaga a rejeição de resolvePeriod para from > to', async () => {
      await expect(service.getFinancialSummary('org-1', { from: '2026-07-31', to: '2026-07-01' })).rejects.toThrow();
    });

    it('propaga a rejeição de resolvePeriod para uma data de calendário impossível', async () => {
      await expect(service.getFinancialSummary('org-1', { from: '2026-02-30' })).rejects.toThrow();
    });
  });

  describe('filtro temporal aplicado a issueDate', () => {
    it('usa issueDate (nunca createdAt) como dimensão temporal, com from/to devolvidos no contrato', async () => {
      const result = await service.getFinancialSummary('org-1', { from: '2026-07-01', to: '2026-07-31' });

      expect(prisma.invoice.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            issueDate: { gte: new Date('2026-07-01T00:00:00.000Z'), lt: new Date('2026-08-01T00:00:00.000Z') },
          }),
        }),
      );
      expect(result.period).toEqual({ from: '2026-07-01', to: '2026-07-31' });
    });
  });

  describe('tendência mensal', () => {
    it('agrega por mês (YYYY-MM) a partir de issueDate, soma via Decimal sem perder precisão', async () => {
      prisma.invoice.findMany.mockResolvedValue([
        { issueDate: new Date('2026-07-05T00:00:00.000Z'), totalAmount: '10.10' },
        { issueDate: new Date('2026-07-20T00:00:00.000Z'), totalAmount: '20.20' },
        { issueDate: new Date('2026-08-01T00:00:00.000Z'), totalAmount: '5.00' },
      ]);

      const result = await service.getFinancialSummary('org-1', {});

      expect(result.monthlyTrend).toEqual([
        { month: '2026-07', count: 2, totalAmount: '30.30' },
        { month: '2026-08', count: 1, totalAmount: '5.00' },
      ]);
    });
  });
});
