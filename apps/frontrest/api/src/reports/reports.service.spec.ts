import { ReportsService } from './reports.service';
import type { DashboardService, FinancialDashboardSummary } from '../dashboard/dashboard.service';
import { createMockPrismaService } from '../../test/utils/mock-prisma';
import type { MockPrismaService } from '../../test/utils/mock-prisma';
import { buildFinancialInsights } from '../financial-insights/financial-insights.util';

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
  function buildService(getFinancialSummary: jest.Mock, prisma?: MockPrismaService, getLargestInvoices?: jest.Mock) {
    const dashboardService = {
      getFinancialSummary,
      // Fase 8.9 — insights derivam de getLargestInvoices() também; omissão devolve sempre lista vazia, nunca undefined.
      getLargestInvoices: getLargestInvoices ?? jest.fn().mockResolvedValue({ period: { from: '', to: '' }, invoices: [] }),
    } as unknown as DashboardService;
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

  describe('Fase 8.9 — Financial Insights', () => {
    it('chama getLargestInvoices() com o mesmo período do mês selecionado, em paralelo com as restantes chamadas', async () => {
      const currentSummary = summary({ activeInvoiceCount: 3, totalAmount: '600.00' });
      currentSummary.topSuppliers = [{ supplierId: 's1', supplierName: 'Hetzner', count: 3, totalAmount: '600.00' }];
      const getFinancialSummary = jest.fn().mockResolvedValueOnce(currentSummary).mockResolvedValueOnce(summary());
      const getLargestInvoices = jest.fn().mockResolvedValue({
        period: { from: '2026-07-01', to: '2026-07-31' },
        invoices: [{ id: 'inv-1', number: 'F-100', supplierName: 'Hetzner', categoryName: 'Hosting', issueDate: '2026-07-20', status: 'PENDING', totalAmount: '300.00' }],
      });
      const { service } = buildService(getFinancialSummary, undefined, getLargestInvoices);

      const report = await service.getMonthlyReport('org-1', '2026-07');

      expect(getLargestInvoices).toHaveBeenCalledWith('org-1', { from: '2026-07-01', to: '2026-07-31' });
      expect(report.insights).toEqual(buildFinancialInsights(currentSummary, [
        { id: 'inv-1', number: 'F-100', supplierName: 'Hetzner', categoryName: 'Hosting', issueDate: '2026-07-20', status: 'PENDING', totalAmount: '300.00' },
      ]));
      expect(report.insights.largestSupplier).toMatchObject({ supplierId: 's1', share: '100.00' });
    });

    it('mês sem faturas devolve Financial Insights vazios, nunca erro', async () => {
      const getFinancialSummary = jest.fn().mockResolvedValue(summary());
      const { service } = buildService(getFinancialSummary);

      const report = await service.getMonthlyReport('org-1', '2026-07');

      expect(report.insights.largestSupplier).toBeNull();
      expect(report.insights.outstanding).toEqual({ count: 0, totalAmount: '0.00' });
      expect(report.insights.trend.direction).toBe('insufficient_data');
    });
  });

  describe('Fase 8.12 — Financial Analysis Engine', () => {
    /** Ambas as análises aplicáveis: tendência com 2 meses consecutivos; concentração com topN efetivo igual (1 fornecedor, 1 categoria). */
    function summaryWithBothAnalysesApplicable(): FinancialDashboardSummary {
      const currentSummary = summary({ activeInvoiceCount: 3, totalAmount: '1000.00' });
      currentSummary.monthlyTrend = [
        { month: '2026-06', count: 2, totalAmount: '800.00' },
        { month: '2026-07', count: 3, totalAmount: '1000.00' },
      ];
      currentSummary.topSuppliers = [{ supplierId: 's1', supplierName: 'Hetzner', count: 3, totalAmount: '600.00' }];
      currentSummary.byCategory = [{ categoryId: 'c1', categoryName: 'Hosting', count: 3, totalAmount: '400.00' }];
      return currentSummary;
    }

    it('constrói os insights uma única vez e executa o motor sobre exatamente esses insights, com as duas análises aplicáveis', async () => {
      const currentSummary = summaryWithBothAnalysesApplicable();
      const getFinancialSummary = jest.fn().mockResolvedValueOnce(currentSummary).mockResolvedValueOnce(summary());
      const { service } = buildService(getFinancialSummary);

      const report = await service.getMonthlyReport('org-1', '2026-07');

      expect(report.analysis.results.map((r) => r.id).sort()).toEqual(['monthly_trend', 'relative_concentration']);
      const trend = report.analysis.results.find((r) => r.id === 'monthly_trend');
      expect(trend).toMatchObject({ conclusion: 'increase' });
      const concentration = report.analysis.results.find((r) => r.id === 'relative_concentration');
      expect(concentration).toMatchObject({ conclusion: 'supplier_more_concentrated' });
      // Executado sobre exatamente os insights construídos — evidência da concentração espelha report.insights, nunca um recálculo.
      expect(concentration?.evidence).toEqual({
        supplierShare: report.insights.supplierConcentration.share,
        supplierTopN: report.insights.supplierConcentration.topN,
        categoryShare: report.insights.categoryConcentration.share,
        categoryTopN: report.insights.categoryConcentration.topN,
      });
    });

    it('quando só uma análise é aplicável (tendência insuficiente), agrega só essa conclusão', async () => {
      const currentSummary = summaryWithBothAnalysesApplicable();
      currentSummary.monthlyTrend = [{ month: '2026-07', count: 3, totalAmount: '1000.00' }];
      const getFinancialSummary = jest.fn().mockResolvedValueOnce(currentSummary).mockResolvedValueOnce(summary());
      const { service } = buildService(getFinancialSummary);

      const report = await service.getMonthlyReport('org-1', '2026-07');

      expect(report.analysis.results.map((r) => r.id)).toEqual(['relative_concentration']);
      expect(report.analysis.metadata.conclusionsProduced).toBe(1);
    });

    it('mês sem faturas devolve analysis.results: [], nunca erro', async () => {
      const getFinancialSummary = jest.fn().mockResolvedValue(summary());
      const { service } = buildService(getFinancialSummary);

      const report = await service.getMonthlyReport('org-1', '2026-07');

      expect(report.analysis.results).toEqual([]);
      expect(report.analysis.metadata).toEqual({
        analysesRun: ['monthly_trend', 'relative_concentration'],
        conclusionsProduced: 0,
      });
    });

    it('seleciona explicitamente as duas análises aprovadas — nunca mais nem menos, independentemente do resultado', async () => {
      const getFinancialSummary = jest.fn().mockResolvedValue(summary());
      const { service } = buildService(getFinancialSummary);

      const report = await service.getMonthlyReport('org-1', '2026-07');

      // Prova por comportamento observável (sem espiar o motor diretamente,
      // conforme instruído): analysesRun reflete sempre exatamente as duas
      // análises registadas, corrido uma única vez — nunca duplicado (4
      // entradas) nem vazio (0 entradas) por múltiplas execuções.
      expect(report.analysis.metadata.analysesRun).toEqual(['monthly_trend', 'relative_concentration']);
    });

    it('devolve insights e analysis como contratos separados, nunca fundidos', async () => {
      const getFinancialSummary = jest.fn().mockResolvedValue(summary());
      const { service } = buildService(getFinancialSummary);

      const report = await service.getMonthlyReport('org-1', '2026-07');

      expect(report.insights).not.toBe(report.analysis);
      expect(report.analysis).not.toHaveProperty('largestSupplier');
      expect(report.insights).not.toHaveProperty('results');
    });

    it('preserva o isolamento por organização — analysis calculado a partir de insights de "org-a" nunca mistura dados de outra organização', async () => {
      const currentSummary = summaryWithBothAnalysesApplicable();
      const getFinancialSummary = jest.fn().mockResolvedValueOnce(currentSummary).mockResolvedValueOnce(summary());
      const { service } = buildService(getFinancialSummary);

      await service.getMonthlyReport('org-a', '2026-07');

      expect(getFinancialSummary).toHaveBeenNthCalledWith(1, 'org-a', { from: '2026-07-01', to: '2026-07-31' });
    });
  });
});
