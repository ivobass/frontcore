import { serializeMonthlyReportToCsv } from './csv.serializer';
import type { MonthlyFinancialReport } from '../reports.service';
import { buildEmptyFinancialInsights } from '../../financial-insights/financial-insights.test-fixtures';

const PERIOD = { from: '2026-07-01', to: '2026-07-31' };

function buildReport(overrides: Partial<MonthlyFinancialReport> = {}): MonthlyFinancialReport {
  return {
    period: { month: '2026-07', from: '2026-07-01', to: '2026-07-31' },
    previousPeriod: { month: '2026-06', from: '2026-06-01', to: '2026-06-30' },
    totals: { invoiceCount: 1, activeInvoiceCount: 1, cancelledInvoiceCount: 0, totalAmount: '100.00', averageAmount: '100.00' },
    comparison: {
      totalAmount: { current: '100.00', previous: '50.00', absoluteChange: '50.00', percentageChange: 100, direction: 'increase' },
      activeInvoiceCount: { current: '1', previous: '1', absoluteChange: '0', percentageChange: 0, direction: 'unchanged' },
    },
    byStatus: [{ status: 'PENDING', count: 1, totalAmount: '100.00' }],
    byCategory: [{ categoryId: null, categoryName: 'Sem categoria', count: 1, totalAmount: '100.00' }],
    topSuppliers: [{ supplierId: 's1', supplierName: 'Fornecedor A', count: 1, totalAmount: '100.00' }],
    invoices: [
      {
        id: 'inv-1',
        number: 'F001',
        supplierName: 'Fornecedor A',
        categoryName: 'Sem categoria',
        issueDate: '2026-07-05',
        dueDate: null,
        status: 'PENDING',
        totalAmount: '100.00',
      },
    ],
    insights: buildEmptyFinancialInsights(PERIOD),
    analysis: { results: [], metadata: { analysesRun: ['monthly_trend', 'relative_concentration'], conclusionsProduced: 0 } },
    ...overrides,
  };
}

describe('serializeMonthlyReportToCsv', () => {
  it('começa com o BOM UTF-8', () => {
    const csv = serializeMonthlyReportToCsv(buildReport());
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('usa ";" como delimitador', () => {
    const csv = serializeMonthlyReportToCsv(buildReport());
    expect(csv).toContain('Estado;Faturas;Total');
  });

  it('inclui a tabela de detalhe de faturas', () => {
    const csv = serializeMonthlyReportToCsv(buildReport());
    expect(csv).toContain('Detalhe das faturas');
    expect(csv).toContain('F001');
    expect(csv).toContain('Fornecedor A');
    expect(csv).toContain('2026-07-05');
  });

  it('traduz os estados internos — nunca expõe o enum PENDING em bruto na tabela de estados', () => {
    const csv = serializeMonthlyReportToCsv(buildReport());
    const statusLine = csv.split('\r\n').find((line) => line.startsWith('Pendente;'));
    expect(statusLine).toBeDefined();
  });

  it('escapa um campo com o delimitador dentro (nome de fornecedor com ";")', () => {
    const report = buildReport({
      topSuppliers: [{ supplierId: 's1', supplierName: 'Fornecedor; Lda', count: 1, totalAmount: '100.00' }],
    });
    const csv = serializeMonthlyReportToCsv(report);
    expect(csv).toContain('"Fornecedor; Lda"');
  });

  it('escapa aspas internas duplicando-as', () => {
    const report = buildReport({
      topSuppliers: [{ supplierId: 's1', supplierName: 'Fornecedor "Top" Lda', count: 1, totalAmount: '100.00' }],
    });
    const csv = serializeMonthlyReportToCsv(report);
    expect(csv).toContain('"Fornecedor ""Top"" Lda"');
  });

  it('escapa quebras de linha dentro de um campo', () => {
    const report = buildReport({
      topSuppliers: [{ supplierId: 's1', supplierName: 'Fornecedor\nLinha 2', count: 1, totalAmount: '100.00' }],
    });
    const csv = serializeMonthlyReportToCsv(report);
    expect(csv).toContain('"Fornecedor\nLinha 2"');
  });

  it.each(['=SOMA(A1:A9)', '+1+1', '-1+1', '@SUM(1+1)'])(
    'protege contra CSV injection — campo iniciado por "%s" recebe prefixo neutralizador',
    (dangerousValue) => {
      const report = buildReport({
        topSuppliers: [{ supplierId: 's1', supplierName: dangerousValue, count: 1, totalAmount: '100.00' }],
      });
      const csv = serializeMonthlyReportToCsv(report);
      expect(csv).toContain(`'${dangerousValue}`);
    },
  );

  it('mantém os montantes como texto decimal exato, nunca reformatado', () => {
    const report = buildReport({
      totals: { invoiceCount: 1, activeInvoiceCount: 1, cancelledInvoiceCount: 0, totalAmount: '1234.56', averageAmount: '1234.56' },
    });
    const csv = serializeMonthlyReportToCsv(report);
    expect(csv).toContain('1234.56');
  });

  it('cabeçalhos em português', () => {
    const csv = serializeMonthlyReportToCsv(buildReport());
    expect(csv).toContain('Relatório Financeiro Mensal');
    expect(csv).toContain('Resumo');
    expect(csv).toContain('Comparação com o período anterior');
  });

  describe('Fase 8.9 — Destaques (Financial Insights)', () => {
    it('inclui a secção de destaques com maior fornecedor/categoria, concentração, por pagar e maior fatura', () => {
      const report = buildReport({
        insights: {
          period: PERIOD,
          largestSupplier: { supplierId: 's1', supplierName: 'Hetzner', count: 3, totalAmount: '600.00', share: '60.00', rank: 1 },
          largestCategory: { categoryId: 'c1', categoryName: 'Hosting', count: 5, totalAmount: '1000.00', share: '100.00', rank: 1 },
          supplierConcentration: { topN: 3, share: '60.00' },
          categoryConcentration: { topN: 3, share: '100.00' },
          outstanding: { count: 2, totalAmount: '200.00' },
          largestExpense: {
            invoice: { id: 'inv-1', number: 'F-100', supplierName: 'Hetzner', categoryName: 'Hosting', issueDate: '2026-07-20', status: 'PENDING', totalAmount: '300.00' },
          },
          trend: {
            latestMonth: '2026-07',
            previousMonth: '2026-06',
            comparison: { current: '600.00', previous: '400.00', absoluteChange: '200.00', percentageChange: '50.00', direction: 'increase' },
            direction: 'increase',
          },
          supplierRanking: [],
          categoryRanking: [],
        },
      });

      const csv = serializeMonthlyReportToCsv(report);

      expect(csv).toContain('Destaques (Financial Insights)');
      expect(csv).toContain('Maior fornecedor;Hetzner;60.00%');
      expect(csv).toContain('Maior categoria;Hosting;100.00%');
      expect(csv).toContain('Por pagar (Pendente + Vencida);2;200.00');
      expect(csv).toContain('Maior fatura;2026-07-20;Hetzner;300.00');
    });

    it('Financial Insights vazios nunca lança nem inventa valores — "Sem dados" em vez de percentagem fabricada', () => {
      const csv = serializeMonthlyReportToCsv(buildReport());

      expect(csv).toContain('Concentração — top 3 fornecedores;Sem dados');
      expect(csv).toContain('Tendência mensal;Dados insuficientes para uma conclusão');
    });
  });

  describe('Fase 8.12 — Análise financeira (Financial Analysis Engine)', () => {
    it('inclui a secção com as conclusões e evidências devolvidas pelo motor, sem recalcular nada', () => {
      const report = buildReport({
        analysis: {
          results: [
            {
              id: 'monthly_trend',
              conclusion: 'increase',
              evidence: { current: '600.00', previous: '400.00', absoluteChange: '200.00', percentageChange: '50.00', direction: 'increase' },
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

      const csv = serializeMonthlyReportToCsv(report);

      expect(csv).toContain('Análise financeira');
      expect(csv).toContain('Tendência mensal;Aumento face ao mês anterior;Atual 600.00, Anterior 400.00, 50.00%');
      expect(csv).toContain(
        'Concentração relativa;Fornecedores mais concentrados do que categorias;Fornecedores 60.00%, Categorias 40.00%',
      );
      // Nunca reformata os montantes/percentagens já devolvidos pelo motor.
      expect(csv).toContain('600.00');
      expect(csv).toContain('60.00%');
    });

    it('sem conclusões aplicáveis, apresenta a mensagem explícita — nunca omite a secção silenciosamente', () => {
      const csv = serializeMonthlyReportToCsv(buildReport());

      expect(csv).toContain('Análise financeira');
      expect(csv).toContain('Sem conclusões aplicáveis neste período.');
    });
  });
});
