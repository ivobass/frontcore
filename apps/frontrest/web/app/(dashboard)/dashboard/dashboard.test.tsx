import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import DashboardPage from './page';

const getFinancialSummary = vi.fn();

vi.mock('../../../lib/dashboard', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/dashboard')>('../../../lib/dashboard');
  return { ...actual, getFinancialSummary: (...args: unknown[]) => getFinancialSummary(...args) };
});

vi.mock('../../../lib/session-context', () => ({
  useSession: () => ({
    session: { accessToken: 'token-abc' },
    me: { user: { id: 'u1', email: 'x@x.com', name: null }, organization: { id: 'org-1', name: 'Org', slug: 'org' }, role: 'MANAGER' },
    logout: () => Promise.resolve(),
  }),
}));

const emptySummary = {
  period: { from: '2026-07-01', to: '2026-07-31' },
  totals: { invoiceCount: 0, activeInvoiceCount: 0, cancelledInvoiceCount: 0, totalAmount: '0.00', averageAmount: '0.00' },
  byStatus: [],
  monthlyTrend: [],
  byCategory: [],
  topSuppliers: [],
};

const filledSummary = {
  period: { from: '2026-07-01', to: '2026-07-31' },
  totals: { invoiceCount: 3, activeInvoiceCount: 3, cancelledInvoiceCount: 1, totalAmount: '1234.56', averageAmount: '411.52' },
  byStatus: [
    { status: 'PENDING', count: 2, totalAmount: '800.00' },
    { status: 'PAID', count: 1, totalAmount: '434.56' },
    { status: 'CANCELLED', count: 1, totalAmount: '999.00' },
  ],
  monthlyTrend: [{ month: '2026-07', count: 3, totalAmount: '1234.56' }],
  byCategory: [{ categoryId: null, categoryName: 'Sem categoria', count: 3, totalAmount: '1234.56' }],
  topSuppliers: [{ supplierId: 'sup-1', supplierName: 'Acme Lda', count: 3, totalAmount: '1234.56' }],
};

describe('DashboardPage (Fase 7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mostra o estado de loading enquanto o pedido está pendente', async () => {
    getFinancialSummary.mockReturnValue(new Promise(() => {}));
    render(<DashboardPage />);
    expect(document.querySelector('[class*="animate-spin"]') ?? screen.getByRole('status', { hidden: true })).toBeTruthy();
  });

  it('mostra uma mensagem de erro quando a API falha', async () => {
    getFinancialSummary.mockRejectedValue(new Error('Falha ao carregar.'));
    render(<DashboardPage />);
    expect(await screen.findByText('Falha ao carregar.')).toBeInTheDocument();
  });

  it('mostra o estado vazio quando o período não tem faturas', async () => {
    getFinancialSummary.mockResolvedValue(emptySummary);
    render(<DashboardPage />);
    expect(await screen.findByText('Sem faturas neste período')).toBeInTheDocument();
  });

  it('renderiza os cards e as secções com dados preenchidos', async () => {
    getFinancialSummary.mockResolvedValue(filledSummary);
    render(<DashboardPage />);

    expect(await screen.findByText('Total de despesas')).toBeInTheDocument();
    expect(screen.getByText('Número de faturas')).toBeInTheDocument();
    expect(screen.getByText('Média por fatura')).toBeInTheDocument();
    expect(screen.getByText('Faturas vencidas')).toBeInTheDocument();
    expect(screen.getByText('Resumo por estado')).toBeInTheDocument();
    expect(screen.getByText('Evolução mensal')).toBeInTheDocument();
    expect(screen.getByText('Distribuição por categoria')).toBeInTheDocument();
    expect(screen.getByText('Principais fornecedores')).toBeInTheDocument();
    expect(screen.getByText('Acme Lda')).toBeInTheDocument();
  });

  it('o total de despesas mostrado é exatamente o devolvido pela API — nunca recalculado a incluir a CANCELLED', async () => {
    getFinancialSummary.mockResolvedValue(filledSummary);
    render(<DashboardPage />);

    await screen.findByText('Total de despesas');
    // 1234.56 (totals.totalAmount, já exclui CANCELLED no backend) — nunca 1234.56 + 999.00.
    expect(screen.getAllByText(/1[\s.,]?234,56\s*€/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/2\s?233,56/)).not.toBeInTheDocument();
  });

  it('datas visíveis ao utilizador aparecem formatadas em pt-PT, nunca como string ISO', async () => {
    getFinancialSummary.mockResolvedValue(filledSummary);
    render(<DashboardPage />);

    expect(await screen.findByText(/01\/07\/2026 a 31\/07\/2026/)).toBeInTheDocument();
    expect(screen.queryByText('2026-07-01')).not.toBeInTheDocument();
    expect(screen.queryByText('2026-07-31')).not.toBeInTheDocument();
  });

  it('envia from/to para a API sempre em YYYY-MM-DD', async () => {
    getFinancialSummary.mockResolvedValue(filledSummary);
    render(<DashboardPage />);

    await waitFor(() => expect(getFinancialSummary).toHaveBeenCalled());
    const [, params] = getFinancialSummary.mock.calls[0];
    expect(params.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(params.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('alterar o período e aplicar dispara um novo pedido com os novos valores', async () => {
    getFinancialSummary.mockResolvedValue(filledSummary);
    render(<DashboardPage />);
    await waitFor(() => expect(getFinancialSummary).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-06-01' } });
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-06-30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar período' }));

    await waitFor(() => expect(getFinancialSummary).toHaveBeenCalledTimes(2));
    const [, params] = getFinancialSummary.mock.calls[1];
    expect(params).toEqual({ from: '2026-06-01', to: '2026-06-30' });
  });

  it('um período inválido (from > to) mostra um erro claro e não dispara pedido novo', async () => {
    getFinancialSummary.mockResolvedValue(filledSummary);
    render(<DashboardPage />);
    await waitFor(() => expect(getFinancialSummary).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-07-31' } });
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-07-01' } });

    expect(await screen.findByText('A data inicial não pode ser posterior à data final.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aplicar período' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar período' }));
    expect(getFinancialSummary).toHaveBeenCalledTimes(1);
  });
});
