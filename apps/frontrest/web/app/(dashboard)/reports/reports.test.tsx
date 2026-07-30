import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ReportsPage from './page';

const getMonthlyReport = vi.fn();
const downloadMonthlyReportCsv = vi.fn();
const downloadMonthlyReportPdf = vi.fn();

vi.mock('../../../lib/reports', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/reports')>('../../../lib/reports');
  return {
    ...actual,
    getMonthlyReport: (...args: unknown[]) => getMonthlyReport(...args),
    downloadMonthlyReportCsv: (...args: unknown[]) => downloadMonthlyReportCsv(...args),
    downloadMonthlyReportPdf: (...args: unknown[]) => downloadMonthlyReportPdf(...args),
  };
});

vi.mock('../../../lib/session-context', () => ({
  useSession: () => ({
    session: { accessToken: 'token-abc' },
    me: {
      user: { id: 'u1', email: 'x@x.com', name: null },
      organization: { id: 'org-1', name: 'Org', slug: 'org' },
      role: 'MANAGER',
    },
    logout: () => Promise.resolve(),
  }),
}));

/** Financial Insights (Fase 8.9) vazios — mesmo formato de `buildEmptyFinancialInsights()` do backend, sem importar entre apps. */
const emptyInsights = {
  period: { from: '2026-07-01', to: '2026-07-31' },
  largestSupplier: null,
  largestCategory: null,
  supplierConcentration: { topN: 3, share: null },
  categoryConcentration: { topN: 3, share: null },
  outstanding: { count: 0, totalAmount: '0.00' },
  largestExpense: { invoice: null },
  trend: { latestMonth: null, previousMonth: null, comparison: null, direction: 'insufficient_data' },
  supplierRanking: [],
  categoryRanking: [],
};

const emptyReport = {
  period: { month: '2026-07', from: '2026-07-01', to: '2026-07-31' },
  previousPeriod: { month: '2026-06', from: '2026-06-01', to: '2026-06-30' },
  totals: { invoiceCount: 0, activeInvoiceCount: 0, cancelledInvoiceCount: 0, totalAmount: '0.00', averageAmount: '0.00' },
  comparison: {
    totalAmount: { current: '0.00', previous: '0.00', absoluteChange: '0.00', percentageChange: null, direction: 'unchanged' },
    activeInvoiceCount: { current: '0', previous: '0', absoluteChange: '0', percentageChange: null, direction: 'unchanged' },
  },
  byStatus: [],
  byCategory: [],
  topSuppliers: [],
  invoices: [],
  insights: emptyInsights,
  analysis: { results: [], metadata: { analysesRun: ['monthly_trend', 'relative_concentration'], conclusionsProduced: 0 } },
};

const filledReport = {
  period: { month: '2026-07', from: '2026-07-01', to: '2026-07-31' },
  previousPeriod: { month: '2026-06', from: '2026-06-01', to: '2026-06-30' },
  totals: { invoiceCount: 3, activeInvoiceCount: 3, cancelledInvoiceCount: 1, totalAmount: '370.00', averageAmount: '123.33' },
  comparison: {
    totalAmount: { current: '370.00', previous: '200.00', absoluteChange: '170.00', percentageChange: 85, direction: 'increase' },
    activeInvoiceCount: { current: '3', previous: '3', absoluteChange: '0', percentageChange: 0, direction: 'unchanged' },
  },
  byStatus: [
    { status: 'PENDING', count: 2, totalAmount: '316.00' },
    { status: 'OVERDUE', count: 1, totalAmount: '54.00' },
  ],
  byCategory: [],
  topSuppliers: [],
  invoices: [
    {
      id: 'inv-1',
      number: 'F001',
      supplierName: 'Hetzner',
      categoryName: 'Hosting',
      issueDate: '2026-07-05',
      dueDate: null,
      status: 'PENDING',
      totalAmount: '316.00',
    },
  ],
  insights: {
    ...emptyInsights,
    largestSupplier: { supplierId: 's1', supplierName: 'Hetzner', count: 2, totalAmount: '316.00', share: '85.41', rank: 1 },
    outstanding: { count: 2, totalAmount: '316.00' },
  },
  analysis: { results: [], metadata: { analysesRun: ['monthly_trend', 'relative_concentration'], conclusionsProduced: 0 } },
};

describe('ReportsPage (Fase 9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mostra o estado de loading enquanto o pedido está pendente', async () => {
    getMonthlyReport.mockReturnValue(new Promise(() => {}));
    render(<ReportsPage />);
    expect(document.querySelector('[class*="animate-spin"]')).toBeTruthy();
  });

  it('mostra uma mensagem de erro quando a API falha', async () => {
    getMonthlyReport.mockRejectedValue(new Error('Falha ao carregar o relatório.'));
    render(<ReportsPage />);
    expect(await screen.findByText('Falha ao carregar o relatório.')).toBeInTheDocument();
  });

  it('Correção pós-revisão — uma resposta antiga sem o campo "insights" nunca lança, só omite a secção "Destaques"', async () => {
    const { insights: _insights, ...reportWithoutInsights } = filledReport;
    getMonthlyReport.mockResolvedValue(reportWithoutInsights);
    render(<ReportsPage />);

    expect(await screen.findByText('Total de despesas')).toBeInTheDocument();
    expect(screen.queryByText('Destaques')).not.toBeInTheDocument();
  });

  it('mostra o estado vazio quando o mês não tem faturas', async () => {
    getMonthlyReport.mockResolvedValue(emptyReport);
    render(<ReportsPage />);
    expect(await screen.findByText('Sem faturas neste período')).toBeInTheDocument();
  });

  it('Fase 8.9 — mostra os Destaques (Financial Insights) com o maior fornecedor e a percentagem real', async () => {
    getMonthlyReport.mockResolvedValue(filledReport);
    render(<ReportsPage />);

    await screen.findByText('Destaques');
    expect(screen.getByText('Hetzner (85.41% do total)')).toBeInTheDocument();
  });

  it('Fase 8.9 — sem dados de insights, mostra "Sem dados" e "Dados insuficientes", nunca lança', async () => {
    getMonthlyReport.mockResolvedValue({ ...filledReport, insights: emptyInsights });
    render(<ReportsPage />);

    await screen.findByText('Destaques');
    expect(screen.getAllByText('Sem dados').length).toBeGreaterThan(0);
    expect(screen.getByText('Dados insuficientes para uma conclusão.')).toBeInTheDocument();
  });

  it('mostra o resumo, a comparação e a tabela de faturas com dados preenchidos', async () => {
    getMonthlyReport.mockResolvedValue(filledReport);
    render(<ReportsPage />);

    expect(await screen.findByText('Total de despesas')).toBeInTheDocument();
    expect(screen.getByText('Número de faturas')).toBeInTheDocument();
    expect(screen.getByText('Resumo por estado')).toBeInTheDocument();
    expect(screen.getByText(/Comparação com/)).toBeInTheDocument();
    expect(screen.getByText('Faturas do período')).toBeInTheDocument();
    expect(screen.getByText('F001')).toBeInTheDocument();
    expect(screen.getByText('Hetzner')).toBeInTheDocument();
  });

  it('comparação de aumento mostra o rótulo "Aumento" e a percentagem', async () => {
    getMonthlyReport.mockResolvedValue(filledReport);
    render(<ReportsPage />);

    await screen.findByText('Total de despesas');
    expect(screen.getByText('Aumento')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
  });

  it('comparação sem alteração mostra "Sem alteração"', async () => {
    getMonthlyReport.mockResolvedValue(filledReport);
    render(<ReportsPage />);

    await screen.findByText('Número de faturas ativas');
    expect(screen.getByText('Sem alteração')).toBeInTheDocument();
  });

  it('comparação de redução mostra "Redução"', async () => {
    getMonthlyReport.mockResolvedValue({
      ...filledReport,
      comparison: {
        ...filledReport.comparison,
        totalAmount: { current: '100.00', previous: '400.00', absoluteChange: '-300.00', percentageChange: -75, direction: 'decrease' },
      },
    });
    render(<ReportsPage />);

    await screen.findByText('Total de despesas');
    expect(screen.getByText('Redução')).toBeInTheDocument();
    expect(screen.getByText('-75%')).toBeInTheDocument();
  });

  it('percentagem indisponível (período anterior sem dados) mostra o texto explícito, nunca Infinity/NaN', async () => {
    getMonthlyReport.mockResolvedValue({
      ...filledReport,
      comparison: {
        ...filledReport.comparison,
        totalAmount: { current: '150.00', previous: '0.00', absoluteChange: '150.00', percentageChange: null, direction: 'increase' },
      },
    });
    render(<ReportsPage />);

    await screen.findByText('Total de despesas');
    expect(screen.getAllByText('Sem dados no período anterior').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Infinity/)).not.toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  it('mudar o mês e aplicar dispara um novo pedido com o novo valor', async () => {
    getMonthlyReport.mockResolvedValue(filledReport);
    render(<ReportsPage />);
    await waitFor(() => expect(getMonthlyReport).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Mês'), { target: { value: '2026-05' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));

    await waitFor(() => expect(getMonthlyReport).toHaveBeenCalledTimes(2));
    expect(getMonthlyReport).toHaveBeenNthCalledWith(2, 'token-abc', '2026-05');
  });

  it('não dispara pedido quando o mês fica vazio', async () => {
    getMonthlyReport.mockResolvedValue(filledReport);
    render(<ReportsPage />);
    await waitFor(() => expect(getMonthlyReport).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Mês'), { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(getMonthlyReport).toHaveBeenCalledTimes(1);
  });

  it('exportar CSV chama downloadMonthlyReportCsv com o mês aplicado', async () => {
    getMonthlyReport.mockResolvedValue(filledReport);
    downloadMonthlyReportCsv.mockResolvedValue(undefined);
    render(<ReportsPage />);
    await screen.findByText('Total de despesas');

    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));

    await waitFor(() => expect(downloadMonthlyReportCsv).toHaveBeenCalledWith('token-abc', '2026-07'));
  });

  it('exportar PDF chama downloadMonthlyReportPdf com o mês aplicado', async () => {
    getMonthlyReport.mockResolvedValue(filledReport);
    downloadMonthlyReportPdf.mockResolvedValue(undefined);
    render(<ReportsPage />);
    await screen.findByText('Total de despesas');

    fireEvent.click(screen.getByRole('button', { name: 'Exportar PDF' }));

    await waitFor(() => expect(downloadMonthlyReportPdf).toHaveBeenCalledWith('token-abc', '2026-07'));
  });

  it('erro de exportação mostra uma mensagem clara', async () => {
    getMonthlyReport.mockResolvedValue(filledReport);
    downloadMonthlyReportCsv.mockRejectedValue(new Error('Não foi possível exportar o relatório.'));
    render(<ReportsPage />);
    await screen.findByText('Total de despesas');

    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));

    expect(await screen.findByText('Não foi possível exportar o relatório.')).toBeInTheDocument();
  });

  describe('Fase 8.12 — Análise financeira (Financial Analysis Engine)', () => {
    it('apresenta a secção "Análise financeira" com a conclusão e a evidência devolvidas pela API, sem recalcular', async () => {
      getMonthlyReport.mockResolvedValue({
        ...filledReport,
        analysis: {
          results: [
            {
              id: 'monthly_trend',
              conclusion: 'increase',
              evidence: { current: '1000.00', previous: '800.00', absoluteChange: '200.00', percentageChange: '25.00', direction: 'increase' },
            },
            {
              id: 'relative_concentration',
              conclusion: 'supplier_more_concentrated',
              evidence: { supplierShare: '60.00', supplierTopN: 1, categoryShare: '40.00', categoryTopN: 1 },
            },
          ],
          metadata: { analysesRun: ['monthly_trend', 'relative_concentration'], conclusionsProduced: 2 },
        },
      });
      render(<ReportsPage />);

      await screen.findByText('Análise financeira');
      // "Tendência mensal" é também o rótulo do card "Destaques" (Fase 8.9) — duas ocorrências esperadas, uma por card.
      expect(screen.getAllByText('Tendência mensal')).toHaveLength(2);
      expect(screen.getByText('Aumento face ao mês anterior')).toBeInTheDocument();
      // Evidência apresentada exatamente como devolvida pela API — nunca recalculada.
      expect(screen.getByText(/1000\.00 € · Anterior 800\.00 €/)).toBeInTheDocument();
      expect(screen.getByText('Concentração relativa')).toBeInTheDocument();
      expect(screen.getByText('Fornecedores mais concentrados do que categorias')).toBeInTheDocument();
      expect(screen.getByText(/Fornecedores 60\.00% · Categorias 40\.00%/)).toBeInTheDocument();
    });

    it('omite a secção "Análise financeira" quando analysis.results está vazio', async () => {
      getMonthlyReport.mockResolvedValue(filledReport);
      render(<ReportsPage />);

      await screen.findByText('Total de despesas');
      expect(screen.queryByText('Análise financeira')).not.toBeInTheDocument();
    });

    it('mantém o comportamento existente da página — Destaques, resumo e faturas continuam a aparecer com analysis presente', async () => {
      getMonthlyReport.mockResolvedValue(filledReport);
      render(<ReportsPage />);

      expect(await screen.findByText('Total de despesas')).toBeInTheDocument();
      await screen.findByText('Destaques');
      expect(screen.getByText('Faturas do período')).toBeInTheDocument();
    });
  });
});
