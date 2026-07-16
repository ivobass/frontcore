import { serializeMonthlyReportToCsv } from './csv.serializer';
import type { MonthlyFinancialReport } from '../reports.service';

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
});
