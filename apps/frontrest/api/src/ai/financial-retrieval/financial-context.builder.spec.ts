import { buildFinancialContextMessage, buildDeterministicReply } from './financial-context.builder';
import type { FinancialRetrievalResult } from './financial-retrieval.service';

const PERIOD = { from: '2026-07-01', to: '2026-07-31' };

describe('buildFinancialContextMessage', () => {
  it('DATA/FINANCIAL_SUMMARY inclui totais e o período consultado', () => {
    const result: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
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
    const result: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
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
    const result: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
      kind: 'DATA',
      period: PERIOD,
      data: { intent: 'OUTSTANDING_BALANCE', outstandingCount: 0, outstandingAmount: '0.00' },
    };

    expect(buildFinancialContextMessage(result)).toContain('Por pagar (Pendente + Vencida): 0 fatura(s), 0.00 EUR.');
  });

  it('DATA/BY_STATUS traduz os estados, nunca expõe o enum interno', () => {
    const result: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
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
    const result: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
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
    const result: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
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
    const result: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
      kind: 'DATA',
      period: PERIOD,
      data: { intent: 'MONTHLY_TREND', monthlyTrend: [{ month: '2026-07', count: 4, totalAmount: '370.00' }] },
    };

    const text = buildFinancialContextMessage(result);

    expect(text).toContain('Evolução mensal: 2026-07: 4 fatura(s), 370.00 EUR.');
    expect(text).not.toContain('Por pagar');
  });

  it('arrays vazios (consulta válida sem faturas) produzem nota explícita, nunca um bloco vazio', () => {
    const result: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
      kind: 'DATA',
      period: PERIOD,
      data: { intent: 'TOP_SUPPLIERS', topSuppliers: [] },
    };

    expect(buildFinancialContextMessage(result)).toContain('Sem faturas confirmadas neste período.');
  });
});

/**
 * Fase 8.3 — texto final pt-PT persistido diretamente como a mensagem
 * `ASSISTANT`, nunca passado pelo provider. Um teste por `kind`.
 */
describe('buildDeterministicReply', () => {
  it('UNSUPPORTED indica ausência de capacidade e as consultas suportadas', () => {
    const text = buildDeterministicReply({ kind: 'UNSUPPORTED' });

    expect(text).toContain('Não tenho essa informação disponível');
    expect(text).toContain('resumo financeiro');
    expect(text).toContain('valores por pagar');
  });

  it('PERIOD_MISSING pede clarificação do período, com exemplos concretos', () => {
    const text = buildDeterministicReply({ kind: 'PERIOD_MISSING' });

    expect(text).toContain('período concreto');
    expect(text).toContain('este mês');
  });

  it('PERIOD_AMBIGUOUS pede clarificação do período, distinto textualmente de PERIOD_MISSING', () => {
    const missing = buildDeterministicReply({ kind: 'PERIOD_MISSING' });
    const ambiguous = buildDeterministicReply({ kind: 'PERIOD_AMBIGUOUS' });

    expect(ambiguous).toContain('Não consegui perceber o período');
    expect(ambiguous).not.toBe(missing);
  });

  it('ERROR informa problema técnico sem inventar valores', () => {
    const text = buildDeterministicReply({ kind: 'ERROR' });

    expect(text).toContain('Não foi possível obter os dados financeiros');
    expect(text).toContain('Tenta novamente');
  });

  it('nunca expõe dados técnicos (stack, queries, ids) em nenhum kind', () => {
    const results: Exclude<FinancialRetrievalResult, { kind: 'DATA' }>[] = [
      { kind: 'UNSUPPORTED' },
      { kind: 'PERIOD_MISSING' },
      { kind: 'PERIOD_AMBIGUOUS' },
      { kind: 'ERROR' },
    ];

    for (const result of results) {
      const text = buildDeterministicReply(result);
      expect(text).not.toMatch(/at \w+\.\w+ \(/); // padrão de stack trace
      expect(text).not.toContain('SELECT');
      expect(text).not.toContain('organizationId');
    }
  });

  it('é texto direto e final — nunca instruções dirigidas ao modelo (ex. "explica ao utilizador")', () => {
    const results: Exclude<FinancialRetrievalResult, { kind: 'DATA' }>[] = [
      { kind: 'UNSUPPORTED' },
      { kind: 'PERIOD_MISSING' },
      { kind: 'PERIOD_AMBIGUOUS' },
      { kind: 'ERROR' },
    ];

    for (const result of results) {
      const text = buildDeterministicReply(result);
      expect(text).not.toMatch(/\bexplica\b|\bpede ao utilizador\b|\binforma o utilizador\b/i);
    }
  });
});
