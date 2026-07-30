import {
  FINANCIAL_CONTEXT_VERSION,
  buildFinancialConversationContext,
  parseFinancialConversationContext,
} from './financial-conversation-context';
import type { FinancialRetrievalResult } from './financial-retrieval.service';
import { buildEmptyFinancialInsights } from '../../financial-insights/financial-insights.test-fixtures';

const NOW = new Date('2026-07-19T10:00:00.000Z');

const DATA_RESULT: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
  kind: 'DATA',
  period: { from: '2026-07-01', to: '2026-07-31' },
  data: {
    intent: 'FINANCIAL_SUMMARY',
    totals: { invoiceCount: 1, activeInvoiceCount: 1, cancelledInvoiceCount: 0, totalAmount: '10.00', averageAmount: '10.00' },
    insights: buildEmptyFinancialInsights({ from: '2026-07-01', to: '2026-07-31' }),
  },
  filters: { status: 'PENDING', supplierId: 'sup-1', supplierName: 'Hetzner' },
};

const COMPARISON_RESULT: Extract<FinancialRetrievalResult, { kind: 'DATA' }> = {
  kind: 'DATA',
  period: { from: '2026-06-01', to: '2026-06-30' },
  data: {
    intent: 'PERIOD_COMPARISON',
    current: { period: { from: '2026-06-01', to: '2026-06-30' }, totals: { invoiceCount: 1, activeInvoiceCount: 1, cancelledInvoiceCount: 0, totalAmount: '10.00', averageAmount: '10.00' } },
    previous: { period: { from: '2026-05-01', to: '2026-05-31' }, totals: { invoiceCount: 1, activeInvoiceCount: 1, cancelledInvoiceCount: 0, totalAmount: '5.00', averageAmount: '5.00' } },
    comparison: {
      totalAmount: { current: '10.00', previous: '5.00', absoluteChange: '5.00', percentageChange: 100, direction: 'increase' },
      activeInvoiceCount: { current: '1', previous: '1', absoluteChange: '0', percentageChange: 0, direction: 'unchanged' },
    },
  },
  filters: {},
};

describe('buildFinancialConversationContext', () => {
  it('constrói o snapshot v1 a partir de um resultado DATA de período único, com os filtros e o período resolvidos', () => {
    const snapshot = buildFinancialConversationContext(DATA_RESULT, NOW);

    expect(snapshot).toEqual({
      version: FINANCIAL_CONTEXT_VERSION,
      intent: 'FINANCIAL_SUMMARY',
      period: { from: '2026-07-01', to: '2026-07-31' },
      filters: { status: 'PENDING', supplierId: 'sup-1', supplierName: 'Hetzner' },
      recordedAt: NOW.toISOString(),
    });
  });

  it('para PERIOD_COMPARISON (Fase 8.6), regista o período como o lado "current" da comparação', () => {
    const snapshot = buildFinancialConversationContext(COMPARISON_RESULT, NOW);

    expect(snapshot.intent).toBe('PERIOD_COMPARISON');
    expect(snapshot.period).toEqual({ from: '2026-06-01', to: '2026-06-30' });
  });

  it('sem filtros aplicados, persiste um objeto de filtros vazio (não omitido)', () => {
    const snapshot = buildFinancialConversationContext(COMPARISON_RESULT, NOW);
    expect(snapshot.filters).toEqual({});
  });
});

describe('parseFinancialConversationContext', () => {
  it('lê de volta exatamente o que buildFinancialConversationContext produziu (round-trip via JSON, como o Prisma faria)', () => {
    const snapshot = buildFinancialConversationContext(DATA_RESULT, NOW);
    const roundTripped = JSON.parse(JSON.stringify(snapshot));

    expect(parseFinancialConversationContext(roundTripped)).toEqual(snapshot);
  });

  it('devolve null para null/undefined (conversa nova, ou anterior a esta fase)', () => {
    expect(parseFinancialConversationContext(null)).toBeNull();
    expect(parseFinancialConversationContext(undefined)).toBeNull();
  });

  it('devolve null para um array (nunca a forma esperada)', () => {
    expect(parseFinancialConversationContext([] as never)).toBeNull();
  });

  it('devolve null para uma versão desconhecida — nunca migra automaticamente', () => {
    const snapshot = buildFinancialConversationContext(DATA_RESULT, NOW);
    expect(parseFinancialConversationContext({ ...snapshot, version: 2 } as never)).toBeNull();
    expect(parseFinancialConversationContext({ ...snapshot, version: undefined } as never)).toBeNull();
  });

  it('devolve null para um intent desconhecido (nunca confiado sem validação)', () => {
    const snapshot = buildFinancialConversationContext(DATA_RESULT, NOW);
    expect(parseFinancialConversationContext({ ...snapshot, intent: 'DELETE_EVERYTHING' } as never)).toBeNull();
  });

  it('devolve null quando period está malformado ou em falta', () => {
    const snapshot = buildFinancialConversationContext(DATA_RESULT, NOW);
    expect(parseFinancialConversationContext({ ...snapshot, period: undefined } as never)).toBeNull();
    expect(parseFinancialConversationContext({ ...snapshot, period: { from: '2026-07-01' } } as never)).toBeNull();
    expect(parseFinancialConversationContext({ ...snapshot, period: 'julho' } as never)).toBeNull();
  });

  it('devolve null quando filters não é um objeto simples (ex. array, ou string)', () => {
    const snapshot = buildFinancialConversationContext(DATA_RESULT, NOW);
    expect(parseFinancialConversationContext({ ...snapshot, filters: [] } as never)).toBeNull();
    expect(parseFinancialConversationContext({ ...snapshot, filters: 'nenhum' } as never)).toBeNull();
  });

  it('devolve null quando filters.status não é um dos 4 estados reais', () => {
    const snapshot = buildFinancialConversationContext(DATA_RESULT, NOW);
    expect(parseFinancialConversationContext({ ...snapshot, filters: { status: 'ARQUIVADA' } } as never)).toBeNull();
  });

  it('devolve null quando um campo de filtro nomeado (ex. supplierName) não é uma string', () => {
    const snapshot = buildFinancialConversationContext(DATA_RESULT, NOW);
    expect(parseFinancialConversationContext({ ...snapshot, filters: { supplierName: 123 } } as never)).toBeNull();
  });

  it('devolve null quando recordedAt está em falta ou não é uma string', () => {
    const snapshot = buildFinancialConversationContext(DATA_RESULT, NOW);
    expect(parseFinancialConversationContext({ ...snapshot, recordedAt: undefined } as never)).toBeNull();
    expect(parseFinancialConversationContext({ ...snapshot, recordedAt: 123 } as never)).toBeNull();
  });

  it('aceita filters vazio ({}) como um snapshot válido — nunca confunde "sem filtros" com "malformado"', () => {
    const snapshot = buildFinancialConversationContext(COMPARISON_RESULT, NOW);
    expect(parseFinancialConversationContext(snapshot as never)).toEqual(snapshot);
  });

  describe('Fase 8.8 — Financial Conversation Context Hardening', () => {
    it('devolve null para period com a forma certa mas calendário impossível (ex. "2026-13-45") — nunca deixa chegar a resolvePeriod(), que lançaria', () => {
      const snapshot = buildFinancialConversationContext(DATA_RESULT, NOW);
      expect(
        parseFinancialConversationContext({ ...snapshot, period: { from: '2026-13-45', to: '2026-13-45' } } as never),
      ).toBeNull();
      expect(
        parseFinancialConversationContext({ ...snapshot, period: { from: '2026-02-30', to: '2026-02-30' } } as never),
      ).toBeNull();
    });

    it('devolve null para period com uma string que não tem sequer forma de data', () => {
      const snapshot = buildFinancialConversationContext(DATA_RESULT, NOW);
      expect(
        parseFinancialConversationContext({ ...snapshot, period: { from: 'not-a-date', to: 'also-not' } } as never),
      ).toBeNull();
    });

    it('devolve null para recordedAt que não é parseável como data, mesmo sendo uma string', () => {
      const snapshot = buildFinancialConversationContext(DATA_RESULT, NOW);
      expect(parseFinancialConversationContext({ ...snapshot, recordedAt: 'nao-e-uma-data' } as never)).toBeNull();
    });

    it('devolve null quando um campo de filtro nomeado é uma string vazia ou só espaço — nunca um filtro "definido mas vazio"', () => {
      const snapshot = buildFinancialConversationContext(DATA_RESULT, NOW);
      expect(parseFinancialConversationContext({ ...snapshot, filters: { supplierName: '' } } as never)).toBeNull();
      expect(parseFinancialConversationContext({ ...snapshot, filters: { supplierId: '   ' } } as never)).toBeNull();
      expect(parseFinancialConversationContext({ ...snapshot, filters: { categoryName: '' } } as never)).toBeNull();
      expect(parseFinancialConversationContext({ ...snapshot, filters: { categoryId: '' } } as never)).toBeNull();
    });

    it('nunca lança perante um valor hostil cuja simples leitura de propriedade lança — devolve null (garantia "nunca lançar", não só "nos casos previstos")', () => {
      const hostileValue = {
        version: 1,
        get intent(): never {
          throw new Error('leitura hostil');
        },
      };

      expect(() => parseFinancialConversationContext(hostileValue as never)).not.toThrow();
      expect(parseFinancialConversationContext(hostileValue as never)).toBeNull();
    });

    it('um snapshot válido com datas de calendário reais (incl. ano bissexto) continua aceite — a validação mais rigorosa nunca rejeita datas reais', () => {
      const snapshot = buildFinancialConversationContext(DATA_RESULT, NOW);
      const leapYearSnapshot = { ...snapshot, period: { from: '2024-02-29', to: '2024-02-29' } };
      expect(parseFinancialConversationContext(leapYearSnapshot as never)).toEqual(leapYearSnapshot);
    });

    describe('correção — from > to nunca é um período válido', () => {
      it('aceita from < to (o caso normal)', () => {
        const snapshot = buildFinancialConversationContext(DATA_RESULT, NOW);
        const validSnapshot = { ...snapshot, period: { from: '2026-07-01', to: '2026-07-31' } };
        expect(parseFinancialConversationContext(validSnapshot as never)).toEqual(validSnapshot);
      });

      it('aceita from == to (um período de um único dia, válido)', () => {
        const snapshot = buildFinancialConversationContext(DATA_RESULT, NOW);
        const singleDaySnapshot = { ...snapshot, period: { from: '2026-07-15', to: '2026-07-15' } };
        expect(parseFinancialConversationContext(singleDaySnapshot as never)).toEqual(singleDaySnapshot);
      });

      it('devolve null quando from > to — nunca deixa chegar a resolvePeriod(), que lançaria BadRequestException', () => {
        const snapshot = buildFinancialConversationContext(DATA_RESULT, NOW);
        expect(
          parseFinancialConversationContext({ ...snapshot, period: { from: '2026-07-31', to: '2026-07-01' } } as never),
        ).toBeNull();
      });

      it('devolve null quando from > to mesmo com só um dia de diferença', () => {
        const snapshot = buildFinancialConversationContext(DATA_RESULT, NOW);
        expect(
          parseFinancialConversationContext({ ...snapshot, period: { from: '2026-07-16', to: '2026-07-15' } } as never),
        ).toBeNull();
      });
    });
  });
});
