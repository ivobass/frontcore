import { AiTenantContextService } from './ai-tenant-context.service';
import type { DashboardService } from '../dashboard/dashboard.service';
import type { FinancialDashboardSummary } from '../dashboard/dashboard.service';

const EMPTY_SUMMARY: FinancialDashboardSummary = {
  period: { from: '2026-07-01', to: '2026-07-31' },
  totals: { invoiceCount: 0, activeInvoiceCount: 0, cancelledInvoiceCount: 0, totalAmount: '0.00', averageAmount: '0.00' },
  byStatus: [],
  monthlyTrend: [],
  byCategory: [],
  topSuppliers: [],
};

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

describe('AiTenantContextService', () => {
  function buildService(getFinancialSummary: jest.Mock) {
    const dashboardService = { getFinancialSummary } as unknown as DashboardService;
    return new AiTenantContextService(dashboardService);
  }

  it('chama DashboardService.getFinancialSummary com a organização autenticada e período omisso (mês atual)', async () => {
    const getFinancialSummary = jest.fn().mockResolvedValue(EMPTY_SUMMARY);
    const service = buildService(getFinancialSummary);

    await service.buildSystemMessage('org-1');

    expect(getFinancialSummary).toHaveBeenCalledWith('org-1', {});
  });

  it('devolve uma mensagem "system" com as regras obrigatórias', async () => {
    const service = buildService(jest.fn().mockResolvedValue(EMPTY_SUMMARY));

    const message = await service.buildSystemMessage('org-1');

    expect(message.role).toBe('system');
    expect(message.content).toContain('Responde só com base nos dados financeiros fornecidos');
    expect(message.content).toContain('nunca adivinhes');
    expect(message.content).toContain('Nunca inventes valores, datas, fornecedores, categorias, faturas');
    expect(message.content).toContain('Nunca sugiras nem finjas alterar');
  });

  it('período sem faturas produz uma nota explícita, sem inventar dados', async () => {
    const service = buildService(jest.fn().mockResolvedValue(EMPTY_SUMMARY));

    const message = await service.buildSystemMessage('org-1');

    expect(message.content).toContain('Sem faturas confirmadas neste período.');
  });

  it('inclui totais, por estado, tendência mensal, categorias e fornecedores quando existem dados', async () => {
    const service = buildService(jest.fn().mockResolvedValue(FILLED_SUMMARY));

    const message = await service.buildSystemMessage('org-1');

    expect(message.content).toContain('Faturas ativas: 4 (total: 370.00 EUR; média: 92.50 EUR)');
    expect(message.content).toContain('Faturas canceladas: 1');
    expect(message.content).toContain('PENDING: 2 fatura(s), 316.00 EUR');
    expect(message.content).toContain('2026-07: 4 fatura(s), 370.00 EUR');
    expect(message.content).toContain('Hosting: 3 fatura(s), 354.00 EUR');
    expect(message.content).toContain('Hetzner: 3 fatura(s), 354.00 EUR');
  });

  it('nunca inclui dados de outra organização — só o resumo devolvido para a organização pedida', async () => {
    const getFinancialSummary = jest.fn().mockResolvedValue(FILLED_SUMMARY);
    const service = buildService(getFinancialSummary);

    await service.buildSystemMessage('org-only-this-one');

    expect(getFinancialSummary).toHaveBeenCalledTimes(1);
    expect(getFinancialSummary).toHaveBeenCalledWith('org-only-this-one', {});
  });
});
