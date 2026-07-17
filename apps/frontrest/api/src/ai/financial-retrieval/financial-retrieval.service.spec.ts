import { FinancialRetrievalService } from './financial-retrieval.service';
import type { DashboardService } from '../../dashboard/dashboard.service';
import type { FinancialDashboardSummary } from '../../dashboard/dashboard.service';

const NOW = new Date('2026-07-16T12:00:00Z');

const FILLED_SUMMARY: FinancialDashboardSummary = {
  period: { from: '2026-07-01', to: '2026-07-31' },
  totals: { invoiceCount: 4, activeInvoiceCount: 4, cancelledInvoiceCount: 1, totalAmount: '370.00', averageAmount: '92.50' },
  byStatus: [
    { status: 'PENDING', count: 2, totalAmount: '316.00' },
    { status: 'OVERDUE', count: 2, totalAmount: '54.00' },
  ],
  monthlyTrend: [{ month: '2026-07', count: 4, totalAmount: '370.00' }],
  byCategory: [{ categoryId: 'cat-1', categoryName: 'Hosting', count: 3, totalAmount: '354.00' }],
  topSuppliers: [{ supplierId: 'sup-1', supplierName: 'Hetzner', count: 3, totalAmount: '354.00' }],
};

const EMPTY_SUMMARY: FinancialDashboardSummary = {
  period: { from: '2026-07-01', to: '2026-07-31' },
  totals: { invoiceCount: 0, activeInvoiceCount: 0, cancelledInvoiceCount: 0, totalAmount: '0.00', averageAmount: '0.00' },
  byStatus: [],
  monthlyTrend: [],
  byCategory: [],
  topSuppliers: [],
};

describe('FinancialRetrievalService', () => {
  function buildService(getFinancialSummary: jest.Mock) {
    const dashboardService = { getFinancialSummary } as unknown as DashboardService;
    return { service: new FinancialRetrievalService(dashboardService), getFinancialSummary };
  }

  it('UNSUPPORTED nunca chama o DashboardService', async () => {
    const { service, getFinancialSummary } = buildService(jest.fn());

    const result = await service.retrieve('org-1', 'Qual é a melhor receita para bacalhau?', NOW);

    expect(result).toEqual({ kind: 'UNSUPPORTED' });
    expect(getFinancialSummary).not.toHaveBeenCalled();
  });

  it('PERIOD_MISSING nunca chama o DashboardService', async () => {
    const { service, getFinancialSummary } = buildService(jest.fn());

    const result = await service.retrieve('org-1', 'Quanto gastei?', NOW);

    expect(result).toEqual({ kind: 'PERIOD_MISSING' });
    expect(getFinancialSummary).not.toHaveBeenCalled();
  });

  it('PERIOD_AMBIGUOUS nunca chama o DashboardService', async () => {
    const { service, getFinancialSummary } = buildService(jest.fn());

    const result = await service.retrieve('org-1', 'Quanto gastei no Natal?', NOW);

    expect(result).toEqual({ kind: 'PERIOD_AMBIGUOUS' });
    expect(getFinancialSummary).not.toHaveBeenCalled();
  });

  it('usa o organizationId autenticado e o período resolvido a partir da mensagem', async () => {
    const { service, getFinancialSummary } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY));

    await service.retrieve('org-42', 'Quanto gastei este mês?', NOW);

    expect(getFinancialSummary).toHaveBeenCalledWith('org-42', { from: '2026-07-01', to: '2026-07-31' });
  });

  it('FINANCIAL_SUMMARY devolve só totals — nenhum outro bloco', async () => {
    const { service } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY));

    const result = await service.retrieve('org-1', 'Quanto gastei este mês?', NOW);

    expect(result).toEqual({
      kind: 'DATA',
      period: { from: '2026-07-01', to: '2026-07-31' },
      data: { intent: 'FINANCIAL_SUMMARY', totals: FILLED_SUMMARY.totals },
    });
  });

  it('OUTSTANDING_BALANCE calcula Pendente + Vencida via Decimal, nunca inclui Paga', async () => {
    const { service } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY));

    const result = await service.retrieve('org-1', 'Quanto tenho por pagar este mês?', NOW);

    expect(result).toEqual({
      kind: 'DATA',
      period: { from: '2026-07-01', to: '2026-07-31' },
      data: { intent: 'OUTSTANDING_BALANCE', outstandingCount: 4, outstandingAmount: '370.00' },
    });
  });

  it('OUTSTANDING_BALANCE com zero faturas pendentes/vencidas devolve zero, nunca omite o campo', async () => {
    const onlyPaid: FinancialDashboardSummary = {
      ...FILLED_SUMMARY,
      byStatus: [{ status: 'PAID', count: 1, totalAmount: '80.00' }],
    };
    const { service } = buildService(jest.fn().mockResolvedValue(onlyPaid));

    const result = await service.retrieve('org-1', 'Quanto tenho por pagar este mês?', NOW);

    expect(result).toEqual({
      kind: 'DATA',
      period: { from: '2026-07-01', to: '2026-07-31' },
      data: { intent: 'OUTSTANDING_BALANCE', outstandingCount: 0, outstandingAmount: '0.00' },
    });
  });

  it('BY_STATUS devolve só byStatus', async () => {
    const { service } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY));

    const result = await service.retrieve('org-1', 'Valores por estado este mês', NOW);

    expect(result).toEqual({
      kind: 'DATA',
      period: { from: '2026-07-01', to: '2026-07-31' },
      data: { intent: 'BY_STATUS', byStatus: FILLED_SUMMARY.byStatus },
    });
  });

  it('BY_CATEGORY devolve só byCategory', async () => {
    const { service } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY));

    const result = await service.retrieve('org-1', 'Principais categorias este mês', NOW);

    expect(result).toEqual({
      kind: 'DATA',
      period: { from: '2026-07-01', to: '2026-07-31' },
      data: { intent: 'BY_CATEGORY', byCategory: FILLED_SUMMARY.byCategory },
    });
  });

  it('TOP_SUPPLIERS devolve só topSuppliers', async () => {
    const { service } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY));

    const result = await service.retrieve('org-1', 'Principais fornecedores este mês', NOW);

    expect(result).toEqual({
      kind: 'DATA',
      period: { from: '2026-07-01', to: '2026-07-31' },
      data: { intent: 'TOP_SUPPLIERS', topSuppliers: FILLED_SUMMARY.topSuppliers },
    });
  });

  it('MONTHLY_TREND devolve só monthlyTrend', async () => {
    const { service } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY));

    const result = await service.retrieve('org-1', 'Evolução mensal este ano', NOW);

    expect(result).toEqual({
      kind: 'DATA',
      period: { from: '2026-07-01', to: '2026-07-31' },
      data: { intent: 'MONTHLY_TREND', monthlyTrend: FILLED_SUMMARY.monthlyTrend },
    });
  });

  it('consulta válida sem faturas devolve DATA com arrays/zeros, nunca UNSUPPORTED nem ERROR', async () => {
    const { service } = buildService(jest.fn().mockResolvedValue(EMPTY_SUMMARY));

    const result = await service.retrieve('org-1', 'Quanto gastei este mês?', NOW);

    expect(result).toEqual({
      kind: 'DATA',
      period: { from: '2026-07-01', to: '2026-07-31' },
      data: { intent: 'FINANCIAL_SUMMARY', totals: EMPTY_SUMMARY.totals },
    });
  });

  it('erro do DashboardService devolve ERROR, nunca propaga a exceção', async () => {
    const { service } = buildService(jest.fn().mockRejectedValue(new Error('falha interna de base de dados')));

    const result = await service.retrieve('org-1', 'Quanto gastei este mês?', NOW);

    expect(result).toEqual({ kind: 'ERROR' });
  });

  it('nunca envia dados de outra organização — só o organizationId pedido é usado na query', async () => {
    const { service, getFinancialSummary } = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY));

    await service.retrieve('org-only-this-one', 'Quanto gastei este mês?', NOW);

    expect(getFinancialSummary).toHaveBeenCalledTimes(1);
    expect(getFinancialSummary).toHaveBeenCalledWith('org-only-this-one', expect.any(Object));
  });
});
