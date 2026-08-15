import {
  buildCategoryRanking,
  buildFinancialInsights,
  buildSupplierRanking,
  computeConcentration,
  resolveLargestExpense,
  resolveOutstanding,
  resolveTrend,
} from './financial-insights.util';
import type { FinancialDashboardSummary, LargestInvoice } from '../dashboard/dashboard.service';

function summary(overrides: Partial<FinancialDashboardSummary> = {}): FinancialDashboardSummary {
  return {
    period: { from: '2026-07-01', to: '2026-07-31' },
    totals: {
      invoiceCount: 0,
      activeInvoiceCount: 0,
      cancelledInvoiceCount: 0,
      totalAmount: '0.00',
      averageAmount: '0.00',
    },
    byStatus: [],
    monthlyTrend: [],
    byCategory: [],
    topSuppliers: [],
    ...overrides,
  };
}

const LARGEST_INVOICE: LargestInvoice = {
  id: 'inv-1',
  number: 'F-100',
  supplierName: 'Hetzner',
  categoryName: 'Hosting',
  issueDate: '2026-07-10',
  status: 'PENDING',
  totalAmount: '600.00',
};

describe('buildSupplierRanking/buildCategoryRanking', () => {
  it('atribui rank 1-based na ordem já recebida (topSuppliers/byCategory já vêm ordenados desc)', () => {
    const ranking = buildSupplierRanking(
      [
        { supplierId: 's1', supplierName: 'Hetzner', count: 3, totalAmount: '600.00' },
        { supplierId: 's2', supplierName: 'AWS', count: 2, totalAmount: '400.00' },
      ],
      '1000.00',
    );

    expect(ranking[0]).toMatchObject({ supplierId: 's1', rank: 1, share: '60.00' });
    expect(ranking[1]).toMatchObject({ supplierId: 's2', rank: 2, share: '40.00' });
  });

  it('total zero → share sempre null, nunca Infinity/NaN', () => {
    const ranking = buildSupplierRanking(
      [{ supplierId: 's1', supplierName: 'Hetzner', count: 1, totalAmount: '0.00' }],
      '0.00',
    );

    expect(ranking[0].share).toBeNull();
  });

  it('lista vazia devolve ranking vazio', () => {
    expect(buildSupplierRanking([], '100.00')).toEqual([]);
    expect(buildCategoryRanking([], '100.00')).toEqual([]);
  });

  it('precisão decimal — 1/3 do total nunca produz erro de vírgula flutuante', () => {
    const ranking = buildCategoryRanking(
      [{ categoryId: 'c1', categoryName: 'Hosting', count: 1, totalAmount: '10.10' }],
      '30.30',
    );

    expect(ranking[0].share).toBe('33.33');
  });
});

describe('computeConcentration', () => {
  it('soma os primeiros topN já ordenados desc, sobre o total', () => {
    const ranking = buildSupplierRanking(
      [
        { supplierId: 's1', supplierName: 'A', count: 1, totalAmount: '500.00' },
        { supplierId: 's2', supplierName: 'B', count: 1, totalAmount: '300.00' },
        { supplierId: 's3', supplierName: 'C', count: 1, totalAmount: '200.00' },
      ],
      '1000.00',
    );

    expect(computeConcentration(ranking, 2, '1000.00')).toEqual({ topN: 2, share: '80.00' });
  });

  it('topN maior que a lista soma só o que existe, nunca lança, e devolve a quantidade efetivamente considerada (correção pós-revisão)', () => {
    const ranking = buildSupplierRanking([{ supplierId: 's1', supplierName: 'A', count: 1, totalAmount: '100.00' }], '100.00');

    expect(computeConcentration(ranking, 10, '100.00')).toEqual({ topN: 1, share: '100.00' });
  });

  it('menos de 3 elementos nunca apresenta um "Top 3" enganador — topN reflete o número real considerado', () => {
    const ranking = buildSupplierRanking(
      [
        { supplierId: 's1', supplierName: 'A', count: 1, totalAmount: '60.00' },
        { supplierId: 's2', supplierName: 'B', count: 1, totalAmount: '40.00' },
      ],
      '100.00',
    );

    expect(computeConcentration(ranking, 3, '100.00')).toEqual({ topN: 2, share: '100.00' });
  });

  it('lista vazia → topN 0, share null (nunca "top 3" sem nenhum elemento)', () => {
    expect(computeConcentration([], 3, '0.00')).toEqual({ topN: 0, share: null });
  });
});

describe('resolveOutstanding', () => {
  it('soma só Pendente + Vencida, nunca Paga/Cancelada', () => {
    const outstanding = resolveOutstanding([
      { status: 'PENDING', count: 2, totalAmount: '100.00' },
      { status: 'OVERDUE', count: 1, totalAmount: '50.00' },
      { status: 'PAID', count: 5, totalAmount: '900.00' },
      { status: 'CANCELLED', count: 1, totalAmount: '20.00' },
    ]);

    expect(outstanding).toEqual({ count: 3, totalAmount: '150.00' });
  });

  it('sem faturas por pagar → zero explícito, nunca omitido', () => {
    expect(resolveOutstanding([])).toEqual({ count: 0, totalAmount: '0.00' });
  });
});

describe('resolveLargestExpense', () => {
  it('devolve a 1ª fatura (já ordenada desc por getLargestInvoices)', () => {
    expect(resolveLargestExpense([LARGEST_INVOICE])).toEqual({ invoice: LARGEST_INVOICE });
  });

  it('sem faturas no período → null, nunca uma fatura fabricada', () => {
    expect(resolveLargestExpense([])).toEqual({ invoice: null });
  });
});

describe('resolveTrend', () => {
  it('menos de 2 meses com dados → insufficient_data, comparação null', () => {
    expect(resolveTrend([])).toEqual({
      latestMonth: null,
      previousMonth: null,
      comparison: null,
      direction: 'insufficient_data',
    });

    expect(resolveTrend([{ month: '2026-07', count: 1, totalAmount: '100.00' }])).toEqual({
      latestMonth: '2026-07',
      previousMonth: null,
      comparison: null,
      direction: 'insufficient_data',
    });
  });

  it('2+ meses consecutivos — compara os dois últimos, percentageChange sempre string decimal (correção pós-revisão, nunca number)', () => {
    const trend = resolveTrend([
      { month: '2026-05', count: 1, totalAmount: '100.00' },
      { month: '2026-06', count: 1, totalAmount: '150.00' },
      { month: '2026-07', count: 1, totalAmount: '200.00' },
    ]);

    expect(trend.latestMonth).toBe('2026-07');
    expect(trend.previousMonth).toBe('2026-06');
    expect(trend.direction).toBe('increase');
    expect(trend.comparison).toEqual({
      current: '200.00',
      previous: '150.00',
      absoluteChange: '50.00',
      percentageChange: '33.33',
      direction: 'increase',
    });
  });

  describe('correção pós-revisão — só meses consecutivos produzem tendência', () => {
    it('meses consecutivos (mesmo ano) produzem tendência real', () => {
      const trend = resolveTrend([
        { month: '2026-06', count: 1, totalAmount: '100.00' },
        { month: '2026-07', count: 1, totalAmount: '150.00' },
      ]);

      expect(trend.direction).not.toBe('insufficient_data');
      expect(trend.comparison).not.toBeNull();
    });

    it('dezembro → janeiro (viragem de ano) conta como consecutivo', () => {
      const trend = resolveTrend([
        { month: '2026-12', count: 1, totalAmount: '100.00' },
        { month: '2027-01', count: 1, totalAmount: '120.00' },
      ]);

      expect(trend.latestMonth).toBe('2027-01');
      expect(trend.previousMonth).toBe('2026-12');
      expect(trend.direction).toBe('increase');
      expect(trend.comparison).toEqual({
        current: '120.00',
        previous: '100.00',
        absoluteChange: '20.00',
        percentageChange: '20.00',
        direction: 'increase',
      });
    });

    it('maio → julho (lacuna, junho em falta) nunca produz uma tendência — insufficient_data explícito', () => {
      const trend = resolveTrend([
        { month: '2026-05', count: 1, totalAmount: '100.00' },
        { month: '2026-07', count: 1, totalAmount: '999.00' },
      ]);

      expect(trend.direction).toBe('insufficient_data');
      expect(trend.comparison).toBeNull();
      expect(trend.latestMonth).toBe('2026-07');
      expect(trend.previousMonth).toBeNull();
    });

    it('apenas um mês com dados → insufficient_data', () => {
      const trend = resolveTrend([{ month: '2026-07', count: 1, totalAmount: '100.00' }]);

      expect(trend.direction).toBe('insufficient_data');
      expect(trend.comparison).toBeNull();
    });

    it('nenhum mês com dados → insufficient_data', () => {
      const trend = resolveTrend([]);

      expect(trend.direction).toBe('insufficient_data');
      expect(trend.comparison).toBeNull();
      expect(trend.latestMonth).toBeNull();
    });
  });
});

describe('correção pós-revisão — desempate determinístico do ranking (Correção 4)', () => {
  it('fornecedores empatados no mesmo valor ficam ordenados por nome (asc), sempre com o mesmo resultado', () => {
    const tied = [
      { supplierId: 's-zebra', supplierName: 'Zebra Lda', count: 1, totalAmount: '100.00' },
      { supplierId: 's-acme', supplierName: 'Acme Lda', count: 1, totalAmount: '100.00' },
    ];

    const ranking = buildSupplierRanking(tied, '200.00');

    expect(ranking.map((row) => row.supplierName)).toEqual(['Acme Lda', 'Zebra Lda']);
    expect(ranking[0].rank).toBe(1);
    expect(ranking[1].rank).toBe(2);
  });

  it('categorias empatadas ficam ordenadas por nome (asc)', () => {
    const tied = [
      { categoryId: 'c-z', categoryName: 'Zeta', count: 1, totalAmount: '50.00' },
      { categoryId: 'c-a', categoryName: 'Alfa', count: 1, totalAmount: '50.00' },
    ];

    const ranking = buildCategoryRanking(tied, '100.00');

    expect(ranking.map((row) => row.categoryName)).toEqual(['Alfa', 'Zeta']);
  });

  it('nunca muta o array original recebido — outros consumidores de FinancialDashboardSummary continuam a ver a ordem original', () => {
    const original = [
      { supplierId: 's-zebra', supplierName: 'Zebra Lda', count: 1, totalAmount: '100.00' },
      { supplierId: 's-acme', supplierName: 'Acme Lda', count: 1, totalAmount: '100.00' },
    ];
    const originalOrder = original.map((row) => row.supplierId);

    buildSupplierRanking(original, '200.00');

    expect(original.map((row) => row.supplierId)).toEqual(originalOrder);
  });

  it('sem empate, a ordem por valor desc já recebida prevalece (desempate só entra em jogo com valores iguais)', () => {
    const ranking = buildSupplierRanking(
      [
        { supplierId: 's1', supplierName: 'Zebra', count: 1, totalAmount: '300.00' },
        { supplierId: 's2', supplierName: 'Acme', count: 1, totalAmount: '100.00' },
      ],
      '400.00',
    );

    expect(ranking.map((row) => row.supplierName)).toEqual(['Zebra', 'Acme']);
  });

  describe('correção final — desempate por supplierId (mesmo nome E mesmo montante)', () => {
    it('dois fornecedores diferentes, mesmo nome, mesmo montante — supplierId decide, sempre com o mesmo resultado independente da ordem de entrada', () => {
      const supplierA = { supplierId: 'sup-aaa', supplierName: 'Hetzner', count: 1, totalAmount: '100.00' };
      const supplierB = { supplierId: 'sup-bbb', supplierName: 'Hetzner', count: 1, totalAmount: '100.00' };

      const rankingOrderAB = buildSupplierRanking([supplierA, supplierB], '200.00');
      const rankingOrderBA = buildSupplierRanking([supplierB, supplierA], '200.00');

      expect(rankingOrderAB.map((row) => row.supplierId)).toEqual(['sup-aaa', 'sup-bbb']);
      expect(rankingOrderBA.map((row) => row.supplierId)).toEqual(['sup-aaa', 'sup-bbb']);
      expect(rankingOrderAB[0].rank).toBe(1);
      expect(rankingOrderAB[1].rank).toBe(2);
    });

    it('nunca muta o array original recebido, também neste cenário de desempate triplo', () => {
      const original = [
        { supplierId: 'sup-bbb', supplierName: 'Hetzner', count: 1, totalAmount: '100.00' },
        { supplierId: 'sup-aaa', supplierName: 'Hetzner', count: 1, totalAmount: '100.00' },
      ];
      const originalOrder = original.map((row) => row.supplierId);

      buildSupplierRanking(original, '200.00');

      expect(original.map((row) => row.supplierId)).toEqual(originalOrder);
    });

    it('categorias continuam sem desempate por id (comportamento inalterado por esta correção) — duas categorias com o mesmo nome ficam na ordem já recebida', () => {
      const categoryA = { categoryId: 'cat-aaa', categoryName: 'Hosting', count: 1, totalAmount: '50.00' };
      const categoryB = { categoryId: 'cat-bbb', categoryName: 'Hosting', count: 1, totalAmount: '50.00' };

      const ranking = buildCategoryRanking([categoryA, categoryB], '100.00');

      expect(ranking.map((row) => row.categoryId)).toEqual(['cat-aaa', 'cat-bbb']);
    });
  });
});

describe('buildFinancialInsights', () => {
  it('compõe todos os campos a partir só de summary + largestInvoices, sem I/O', () => {
    const dashboardSummary = summary({
      totals: { invoiceCount: 4, activeInvoiceCount: 4, cancelledInvoiceCount: 0, totalAmount: '1000.00', averageAmount: '250.00' },
      byStatus: [
        { status: 'PENDING', count: 2, totalAmount: '400.00' },
        { status: 'OVERDUE', count: 1, totalAmount: '100.00' },
        { status: 'PAID', count: 1, totalAmount: '500.00' },
      ],
      byCategory: [{ categoryId: 'c1', categoryName: 'Hosting', count: 3, totalAmount: '600.00' }],
      topSuppliers: [{ supplierId: 's1', supplierName: 'Hetzner', count: 3, totalAmount: '600.00' }],
      monthlyTrend: [
        { month: '2026-06', count: 2, totalAmount: '400.00' },
        { month: '2026-07', count: 2, totalAmount: '600.00' },
      ],
    });

    const insights = buildFinancialInsights(dashboardSummary, [LARGEST_INVOICE]);

    expect(insights.period).toEqual(dashboardSummary.period);
    expect(insights.largestSupplier).toMatchObject({ supplierId: 's1', share: '60.00', rank: 1 });
    expect(insights.largestCategory).toMatchObject({ categoryId: 'c1', share: '60.00', rank: 1 });
    // Só 1 fornecedor/categoria na fixture — topN reflete a quantidade
    // efetivamente considerada (correção pós-revisão), nunca o
    // FINANCIAL_INSIGHTS_SUPPLIER_TOP_N/CATEGORY_TOP_N configurado (3)
    // quando há menos elementos reais do que esse limite.
    expect(insights.supplierConcentration).toEqual({ topN: 1, share: '60.00' });
    expect(insights.categoryConcentration).toEqual({ topN: 1, share: '60.00' });
    expect(insights.outstanding).toEqual({ count: 3, totalAmount: '500.00' });
    expect(insights.largestExpense).toEqual({ invoice: LARGEST_INVOICE });
    expect(insights.trend.direction).toBe('increase');
    expect(insights.supplierRanking).toHaveLength(1);
    expect(insights.categoryRanking).toHaveLength(1);
  });

  it('período totalmente vazio nunca lança e nunca produz Infinity/NaN em nenhum campo', () => {
    const insights = buildFinancialInsights(summary(), []);

    expect(JSON.stringify(insights)).not.toMatch(/Infinity|NaN/);
    expect(insights.largestSupplier).toBeNull();
    expect(insights.largestCategory).toBeNull();
    expect(insights.supplierConcentration.share).toBeNull();
    expect(insights.categoryConcentration.share).toBeNull();
    expect(insights.outstanding).toEqual({ count: 0, totalAmount: '0.00' });
    expect(insights.largestExpense).toEqual({ invoice: null });
    expect(insights.trend.direction).toBe('insufficient_data');
  });
});
