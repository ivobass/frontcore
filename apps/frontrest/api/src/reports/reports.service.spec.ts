import { ReportsService } from './reports.service';
import type { DashboardService, FinancialDashboardSummary } from '../dashboard/dashboard.service';
import { createMockPrismaService } from '../../test/utils/mock-prisma';
import type { MockPrismaService } from '../../test/utils/mock-prisma';

function summary(
  overrides: Partial<FinancialDashboardSummary['totals']> = {},
  from = '2026-07-01',
  to = '2026-07-31',
): FinancialDashboardSummary {
  return {
    period: { from, to },
    totals: {
      invoiceCount: 0,
      activeInvoiceCount: 0,
      cancelledInvoiceCount: 0,
      totalAmount: '0.00',
      averageAmount: '0.00',
      ...overrides,
    },
    byStatus: [],
    monthlyTrend: [],
    byCategory: [],
    topSuppliers: [],
  };
}

describe('ReportsService', () => {
  function buildService(getFinancialSummary: jest.Mock, prisma?: MockPrismaService) {
    const dashboardService = { getFinancialSummary } as unknown as DashboardService;
    const prismaService = prisma ?? createMockPrismaService();
    prismaService.invoice.findMany.mockResolvedValue([]);
    return { service: new ReportsService(dashboardService, prismaService as never), prisma: prismaService };
  }

  it('chama DashboardService duas vezes — mês selecionado e mês anterior', async () => {
    const getFinancialSummary = jest
      .fn()
      .mockResolvedValueOnce(summary({ activeInvoiceCount: 4, totalAmount: '370.00' }, '2026-07-01', '2026-07-31'))
      .mockResolvedValueOnce(summary({ activeInvoiceCount: 2, totalAmount: '200.00' }, '2026-06-01', '2026-06-30'));
    const { service } = buildService(getFinancialSummary);

    const report = await service.getMonthlyReport('org-1', '2026-07');

    expect(getFinancialSummary).toHaveBeenNthCalledWith(1, 'org-1', { from: '2026-07-01', to: '2026-07-31' });
    expect(getFinancialSummary).toHaveBeenNthCalledWith(2, 'org-1', { from: '2026-06-01', to: '2026-06-30' });
    expect(report.period).toEqual({ month: '2026-07', from: '2026-07-01', to: '2026-07-31' });
    expect(report.previousPeriod).toEqual({ month: '2026-06', from: '2026-06-01', to: '2026-06-30' });
  });

  it('totals/byStatus/byCategory/topSuppliers vêm diretamente do resumo do mês selecionado (API pública, sem duplicar)', async () => {
    const currentSummary = summary({ activeInvoiceCount: 4, totalAmount: '370.00' });
    currentSummary.byStatus = [{ status: 'PENDING', count: 2, totalAmount: '316.00' }];
    currentSummary.byCategory = [{ categoryId: 'c1', categoryName: 'Hosting', count: 3, totalAmount: '354.00' }];
    currentSummary.topSuppliers = [{ supplierId: 's1', supplierName: 'Hetzner', count: 3, totalAmount: '354.00' }];
    const getFinancialSummary = jest.fn().mockResolvedValueOnce(currentSummary).mockResolvedValueOnce(summary());
    const { service } = buildService(getFinancialSummary);

    const report = await service.getMonthlyReport('org-1', '2026-07');

    expect(report.totals).toBe(currentSummary.totals);
    expect(report.byStatus).toBe(currentSummary.byStatus);
    expect(report.byCategory).toBe(currentSummary.byCategory);
    expect(report.topSuppliers).toBe(currentSummary.topSuppliers);
  });

  it('isolamento por organização — DashboardService e Prisma chamados com a mesma organizationId', async () => {
    const getFinancialSummary = jest.fn().mockResolvedValue(summary());
    const { service, prisma } = buildService(getFinancialSummary);

    await service.getMonthlyReport('org-42', '2026-07');

    expect(getFinancialSummary).toHaveBeenCalledWith('org-42', expect.anything());
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-42' }) }),
    );
  });

  it('detalhe de faturas nunca consulta InvoiceDraft — só prisma.invoice', async () => {
    const getFinancialSummary = jest.fn().mockResolvedValue(summary());
    const { service, prisma } = buildService(getFinancialSummary);

    await service.getMonthlyReport('org-1', '2026-07');

    expect(prisma.invoiceDraft.findMany).not.toHaveBeenCalled();
  });

  it('detalhe de faturas não filtra por status — inclui CANCELLED, distinguível pelo campo status', async () => {
    const getFinancialSummary = jest.fn().mockResolvedValue(summary());
    const { service, prisma } = buildService(getFinancialSummary);
    prisma.invoice.findMany.mockResolvedValue([
      {
        id: 'inv-1',
        number: 'F1',
        issueDate: new Date('2026-07-05'),
        dueDate: null,
        status: 'CANCELLED',
        totalAmount: '50.00',
        supplier: { name: 'Fornecedor A' },
        category: null,
      },
    ]);

    const report = await service.getMonthlyReport('org-1', '2026-07');

    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.not.objectContaining({ status: expect.anything() }) }),
    );
    expect(report.invoices).toHaveLength(1);
    expect(report.invoices[0].status).toBe('CANCELLED');
    expect(report.invoices[0].categoryName).toBe('Sem categoria');
  });

  it('detalhe ordenado por issueDate ascendente', async () => {
    const getFinancialSummary = jest.fn().mockResolvedValue(summary());
    const { service, prisma } = buildService(getFinancialSummary);

    await service.getMonthlyReport('org-1', '2026-07');

    expect(prisma.invoice.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { issueDate: 'asc' } }));
  });

  it('relatório vazio devolve invoices: [] sem erro', async () => {
    const getFinancialSummary = jest.fn().mockResolvedValue(summary());
    const { service } = buildService(getFinancialSummary);

    const report = await service.getMonthlyReport('org-1', '2026-07');

    expect(report.invoices).toEqual([]);
  });

  describe('comparação', () => {
    it('comparação positiva (aumento) calcula variação absoluta/percentual/direção corretamente', async () => {
      const getFinancialSummary = jest
        .fn()
        .mockResolvedValueOnce(summary({ activeInvoiceCount: 4, totalAmount: '400.00' }))
        .mockResolvedValueOnce(summary({ activeInvoiceCount: 2, totalAmount: '200.00' }));
      const { service } = buildService(getFinancialSummary);

      const report = await service.getMonthlyReport('org-1', '2026-07');

      expect(report.comparison.totalAmount).toEqual({
        current: '400.00',
        previous: '200.00',
        absoluteChange: '200.00',
        percentageChange: 100,
        direction: 'increase',
      });
      expect(report.comparison.activeInvoiceCount.direction).toBe('increase');
    });

    it('comparação negativa (redução)', async () => {
      const getFinancialSummary = jest
        .fn()
        .mockResolvedValueOnce(summary({ totalAmount: '100.00' }))
        .mockResolvedValueOnce(summary({ totalAmount: '400.00' }));
      const { service } = buildService(getFinancialSummary);

      const report = await service.getMonthlyReport('org-1', '2026-07');

      expect(report.comparison.totalAmount.absoluteChange).toBe('-300.00');
      expect(report.comparison.totalAmount.percentageChange).toBe(-75);
      expect(report.comparison.totalAmount.direction).toBe('decrease');
    });

    it('valores iguais → unchanged, percentagem 0', async () => {
      const getFinancialSummary = jest
        .fn()
        .mockResolvedValueOnce(summary({ totalAmount: '150.00' }))
        .mockResolvedValueOnce(summary({ totalAmount: '150.00' }));
      const { service } = buildService(getFinancialSummary);

      const report = await service.getMonthlyReport('org-1', '2026-07');

      expect(report.comparison.totalAmount.direction).toBe('unchanged');
      expect(report.comparison.totalAmount.percentageChange).toBe(0);
    });

    it('período anterior com zero → percentageChange null, nunca uma divisão por zero', async () => {
      const getFinancialSummary = jest
        .fn()
        .mockResolvedValueOnce(summary({ totalAmount: '150.00', activeInvoiceCount: 3 }))
        .mockResolvedValueOnce(summary({ totalAmount: '0.00', activeInvoiceCount: 0 }));
      const { service } = buildService(getFinancialSummary);

      const report = await service.getMonthlyReport('org-1', '2026-07');

      expect(report.comparison.totalAmount.percentageChange).toBeNull();
      expect(report.comparison.activeInvoiceCount.percentageChange).toBeNull();
      expect(report.comparison.totalAmount.direction).toBe('increase');
    });

    it('nunca produz Infinity/-Infinity/NaN em nenhum campo de comparação', async () => {
      const getFinancialSummary = jest
        .fn()
        .mockResolvedValueOnce(summary({ totalAmount: '0.00', activeInvoiceCount: 0 }))
        .mockResolvedValueOnce(summary({ totalAmount: '0.00', activeInvoiceCount: 0 }));
      const { service } = buildService(getFinancialSummary);

      const report = await service.getMonthlyReport('org-1', '2026-07');

      const serialized = JSON.stringify(report.comparison);
      expect(serialized).not.toContain('Infinity');
      expect(serialized).not.toContain('NaN');
      expect(report.comparison.totalAmount.direction).toBe('unchanged');
    });

    it('precisão monetária — subtração via Decimal, sem erro de arredondamento float', async () => {
      const getFinancialSummary = jest
        .fn()
        .mockResolvedValueOnce(summary({ totalAmount: '0.30' }))
        .mockResolvedValueOnce(summary({ totalAmount: '0.10' }));
      const { service } = buildService(getFinancialSummary);

      const report = await service.getMonthlyReport('org-1', '2026-07');

      // 0.30 - 0.10 com number puro dá frequentemente 0.19999999999999998 — aqui tem de ser exatamente 0.20.
      expect(report.comparison.totalAmount.absoluteChange).toBe('0.20');
    });
  });
});
