import { serializeMonthlyReportToPdf } from './pdf.serializer';
import type { MonthlyFinancialReport } from '../reports.service';
import { buildEmptyFinancialInsights } from '../../financial-insights/financial-insights.test-fixtures';

function buildReport(overrides: Partial<MonthlyFinancialReport> = {}): MonthlyFinancialReport {
  return {
    period: { month: '2026-07', from: '2026-07-01', to: '2026-07-31' },
    previousPeriod: { month: '2026-06', from: '2026-06-01', to: '2026-06-30' },
    totals: { invoiceCount: 1, activeInvoiceCount: 1, cancelledInvoiceCount: 0, totalAmount: '370.00', averageAmount: '370.00' },
    comparison: {
      totalAmount: { current: '370.00', previous: '200.00', absoluteChange: '170.00', percentageChange: 85, direction: 'increase' },
      activeInvoiceCount: { current: '1', previous: '1', absoluteChange: '0', percentageChange: 0, direction: 'unchanged' },
    },
    byStatus: [{ status: 'PENDING', count: 1, totalAmount: '370.00' }],
    byCategory: [],
    topSuppliers: [],
    insights: buildEmptyFinancialInsights({ from: '2026-07-01', to: '2026-07-31' }),
    invoices: [
      {
        id: 'inv-1',
        number: 'F001',
        supplierName: 'Fornecedor A',
        categoryName: 'Sem categoria',
        issueDate: '2026-07-05',
        dueDate: null,
        status: 'PENDING',
        totalAmount: '370.00',
      },
    ],
    ...overrides,
  };
}

describe('serializeMonthlyReportToPdf', () => {
  it('devolve um Buffer com a assinatura PDF (%PDF-) e tamanho não-zero', async () => {
    const pdf = await serializeMonthlyReportToPdf(buildReport());
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(0);
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('conteúdo cresce proporcionalmente aos dados — não é um output estático', async () => {
    // PDFKit codifica texto como fragmentos hex com kerning intercalado
    // (não texto ASCII literal), por isso a confirmação de conteúdo real
    // (sem depender só de inspeção visual) é estrutural: um relatório com
    // mais faturas tem de produzir um PDF genuinamente maior.
    const smallPdf = await serializeMonthlyReportToPdf(buildReport());
    const manyInvoices = Array.from({ length: 30 }, (_, index) => ({
      id: `inv-${index}`,
      number: `F${String(index).padStart(3, '0')}`,
      supplierName: `Fornecedor ${index}`,
      categoryName: 'Sem categoria',
      issueDate: '2026-07-05',
      dueDate: null as string | null,
      status: 'PENDING' as const,
      totalAmount: '10.00',
    }));
    const largePdf = await serializeMonthlyReportToPdf(buildReport({ invoices: manyInvoices }), { compress: false });

    expect(largePdf.length).toBeGreaterThan(smallPdf.length);
  });

  it('gera um documento válido também para um relatório vazio (sem faturas)', async () => {
    const pdf = await serializeMonthlyReportToPdf(
      buildReport({
        totals: { invoiceCount: 0, activeInvoiceCount: 0, cancelledInvoiceCount: 0, totalAmount: '0.00', averageAmount: '0.00' },
        invoices: [],
      }),
    );
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('lida com múltiplas faturas sem lançar erro e gera páginas adicionais (paginação automática do PDFKit)', async () => {
    const manyInvoices = Array.from({ length: 80 }, (_, index) => ({
      id: `inv-${index}`,
      number: `F${String(index).padStart(3, '0')}`,
      supplierName: `Fornecedor ${index}`,
      categoryName: 'Sem categoria',
      issueDate: '2026-07-05',
      dueDate: null as string | null,
      status: 'PENDING' as const,
      totalAmount: '10.00',
    }));

    const pdf = await serializeMonthlyReportToPdf(buildReport({ invoices: manyInvoices }), { compress: false });

    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    // `/Type /Pages ... /Count N` — confirmação estrutural real de que
    // mais do que uma página foi gerada, não só ausência de erro.
    const pageCountMatch = pdf.toString('latin1').match(/\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/);
    expect(pageCountMatch).not.toBeNull();
    expect(Number(pageCountMatch?.[1])).toBeGreaterThan(1);
  });
});
