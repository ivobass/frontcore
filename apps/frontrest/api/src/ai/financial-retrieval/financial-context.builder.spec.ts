import { buildFinancialContextMessage } from './financial-context.builder';
import type { FinancialRetrievalResult } from './financial-retrieval.service';

const PERIOD = { from: '2026-07-01', to: '2026-07-31' };

describe('buildFinancialContextMessage', () => {
  it('UNSUPPORTED indica ausência de capacidade e as consultas suportadas, sem inventar dados', () => {
    const text = buildFinancialContextMessage({ kind: 'UNSUPPORTED' });

    expect(text).toContain('fora das consultas financeiras disponíveis');
    expect(text).toContain('sem inventar dados');
    expect(text).toContain('sem afirmar que executaste qualquer ação');
    expect(text).toContain('resumo financeiro');
    expect(text).toContain('valores por pagar');
  });

  it('PERIOD_MISSING pede clarificação do período, com exemplos concretos', () => {
    const text = buildFinancialContextMessage({ kind: 'PERIOD_MISSING' });

    expect(text).toContain('não foi possível identificar um período');
    expect(text).toContain('este mês');
    expect(text).toContain('nunca assumas o mês atual');
  });

  it('PERIOD_AMBIGUOUS pede clarificação do período, distinto textualmente de PERIOD_MISSING', () => {
    const missing = buildFinancialContextMessage({ kind: 'PERIOD_MISSING' });
    const ambiguous = buildFinancialContextMessage({ kind: 'PERIOD_AMBIGUOUS' });

    expect(ambiguous).toContain('não foi possível interpretar com segurança');
    expect(ambiguous).not.toBe(missing);
  });

  it('ERROR informa problema técnico sem inventar valores', () => {
    const text = buildFinancialContextMessage({ kind: 'ERROR' });

    expect(text).toContain('problema técnico');
    expect(text).toContain('sem inventar valores');
  });

  it('DATA/FINANCIAL_SUMMARY inclui totais e o período consultado', () => {
    const result: FinancialRetrievalResult = {
      kind: 'DATA',
      period: PERIOD,
      data: {
        intent: 'FINANCIAL_SUMMARY',
        totals: { invoiceCount: 4, activeInvoiceCount: 4, cancelledInvoiceCount: 1, totalAmount: '370.00', averageAmount: '92.50' },
      },
    };

    const text = buildFinancialContextMessage(result);

    expect(text).toContain('Período consultado: 2026-07-01 a 2026-07-31.');
    expect(text).toContain('Faturas ativas: 4 (total: 370.00 EUR; média: 92.50 EUR).');
    expect(text).toContain('Faturas canceladas: 1.');
    expect(text).not.toContain('Por estado');
    expect(text).not.toContain('Principais fornecedores');
  });

  it('DATA/FINANCIAL_SUMMARY com zero faturas produz nota explícita, não um erro', () => {
    const result: FinancialRetrievalResult = {
      kind: 'DATA',
      period: PERIOD,
      data: {
        intent: 'FINANCIAL_SUMMARY',
        totals: { invoiceCount: 0, activeInvoiceCount: 0, cancelledInvoiceCount: 0, totalAmount: '0.00', averageAmount: '0.00' },
      },
    };

    expect(buildFinancialContextMessage(result)).toContain('Sem faturas confirmadas neste período.');
  });

  it('DATA/OUTSTANDING_BALANCE inclui o valor pré-calculado, mesmo a zero — nunca omitido', () => {
    const result: FinancialRetrievalResult = {
      kind: 'DATA',
      period: PERIOD,
      data: { intent: 'OUTSTANDING_BALANCE', outstandingCount: 0, outstandingAmount: '0.00' },
    };

    expect(buildFinancialContextMessage(result)).toContain('Por pagar (Pendente + Vencida): 0 fatura(s), 0.00 EUR.');
  });

  it('DATA/BY_STATUS traduz os estados, nunca expõe o enum interno', () => {
    const result: FinancialRetrievalResult = {
      kind: 'DATA',
      period: PERIOD,
      data: {
        intent: 'BY_STATUS',
        byStatus: [
          { status: 'PENDING', count: 2, totalAmount: '316.00' },
          { status: 'OVERDUE', count: 2, totalAmount: '54.00' },
        ],
      },
    };

    const text = buildFinancialContextMessage(result);

    expect(text).toContain('Por estado: Pendente: 2 fatura(s), 316.00 EUR; Vencida: 2 fatura(s), 54.00 EUR.');
    expect(text).not.toMatch(/\b(PENDING|OVERDUE|PAID|CANCELLED)\b/);
    expect(text).not.toContain('Faturas ativas');
    expect(text).not.toContain('Principais fornecedores');
  });

  it('DATA/BY_CATEGORY inclui só o bloco de categorias', () => {
    const result: FinancialRetrievalResult = {
      kind: 'DATA',
      period: PERIOD,
      data: {
        intent: 'BY_CATEGORY',
        byCategory: [{ categoryId: 'cat-1', categoryName: 'Hosting', count: 3, totalAmount: '354.00' }],
      },
    };

    const text = buildFinancialContextMessage(result);

    expect(text).toContain('Por categoria: Hosting: 3 fatura(s), 354.00 EUR.');
    expect(text).not.toContain('Evolução mensal');
  });

  it('DATA/TOP_SUPPLIERS inclui só o bloco de fornecedores', () => {
    const result: FinancialRetrievalResult = {
      kind: 'DATA',
      period: PERIOD,
      data: {
        intent: 'TOP_SUPPLIERS',
        topSuppliers: [{ supplierId: 'sup-1', supplierName: 'Hetzner', count: 3, totalAmount: '354.00' }],
      },
    };

    const text = buildFinancialContextMessage(result);

    expect(text).toContain('Principais fornecedores: Hetzner: 3 fatura(s), 354.00 EUR.');
    expect(text).not.toContain('Por categoria');
  });

  it('DATA/MONTHLY_TREND inclui só o bloco de evolução mensal', () => {
    const result: FinancialRetrievalResult = {
      kind: 'DATA',
      period: PERIOD,
      data: { intent: 'MONTHLY_TREND', monthlyTrend: [{ month: '2026-07', count: 4, totalAmount: '370.00' }] },
    };

    const text = buildFinancialContextMessage(result);

    expect(text).toContain('Evolução mensal: 2026-07: 4 fatura(s), 370.00 EUR.');
    expect(text).not.toContain('Por pagar');
  });

  it('arrays vazios (consulta válida sem faturas) produzem nota explícita, nunca um bloco vazio', () => {
    const result: FinancialRetrievalResult = {
      kind: 'DATA',
      period: PERIOD,
      data: { intent: 'TOP_SUPPLIERS', topSuppliers: [] },
    };

    expect(buildFinancialContextMessage(result)).toContain('Sem faturas confirmadas neste período.');
  });

  it('nunca expõe dados técnicos (stack, queries, ids sem utilidade) em nenhum kind', () => {
    const results: FinancialRetrievalResult[] = [
      { kind: 'UNSUPPORTED' },
      { kind: 'PERIOD_MISSING' },
      { kind: 'PERIOD_AMBIGUOUS' },
      { kind: 'ERROR' },
    ];

    for (const result of results) {
      const text = buildFinancialContextMessage(result);
      expect(text).not.toMatch(/at \w+\.\w+ \(/); // padrão de stack trace
      expect(text).not.toContain('SELECT');
      expect(text).not.toContain('organizationId');
    }
  });
});
