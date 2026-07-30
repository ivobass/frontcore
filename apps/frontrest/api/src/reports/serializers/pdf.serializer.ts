import PDFDocument from 'pdfkit';
import type { MonthlyFinancialReport } from '../reports.service';
import type { FinancialAnalysisOutcome } from '../../financial-analysis/types';

/** Local a `reports/` deliberadamente — ver csv.serializer.ts. */
const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  PAID: 'Paga',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
};

function translateDirection(direction: 'increase' | 'decrease' | 'unchanged'): string {
  switch (direction) {
    case 'increase':
      return 'Aumento';
    case 'decrease':
      return 'Redução';
    case 'unchanged':
      return 'Sem alteração';
  }
}

function formatPercentage(value: number | null): string {
  return value === null ? 'sem dados no período anterior' : `${value}%`;
}

/** `share` já vem normalizado a 2 casas (`financial-insights.util.ts`) — o "%" é acrescentado só aqui, na camada de apresentação. */
function formatShare(share: string | null): string {
  return share === null ? 'sem dados' : `${share}%`;
}

/** Rótulos próprios do PDF (Fase 8.12) — duplicados deliberadamente do CSV/frontend, mesma disciplina de `STATUS_LABELS` acima. */
const ANALYSIS_TITLES: Record<FinancialAnalysisOutcome['id'], string> = {
  monthly_trend: 'Tendência mensal',
  relative_concentration: 'Concentração relativa',
};

const CONCLUSION_LABELS: Record<string, string> = {
  increase: 'aumento face ao mês anterior',
  decrease: 'redução face ao mês anterior',
  unchanged: 'sem alteração face ao mês anterior',
  supplier_more_concentrated: 'fornecedores mais concentrados do que categorias',
  category_more_concentrated: 'categorias mais concentradas do que fornecedores',
  equally_concentrated: 'concentração equivalente entre fornecedores e categorias',
};

/** Só apresenta os campos de evidência já devolvidos pelo motor — nunca recalcula nem infere nada a partir deles. */
function describeAnalysisEvidence(result: FinancialAnalysisOutcome): string {
  if (result.id === 'monthly_trend') {
    const { current, previous, percentageChange } = result.evidence;
    return `atual ${current} EUR, anterior ${previous} EUR${percentageChange !== null ? `, ${percentageChange}%` : ''}`;
  }
  const { supplierShare, categoryShare } = result.evidence;
  return `fornecedores ${supplierShare}%, categorias ${categoryShare}%`;
}

export interface SerializePdfOptions {
  /**
   * Só para testes: `false` desativa a compressão `flate` dos streams
   * de conteúdo, tornando o texto escrito legível diretamente no
   * `Buffer` — evita introduzir uma dependência de parsing de PDF só
   * para os testes conseguirem confirmar que o conteúdo correto foi
   * escrito. Nunca desativado em produção (ficheiro maior sem motivo).
   */
  compress?: boolean;
}

/**
 * PDF do relatório mensal (Fase 9) — PDFKit, fontes standard
 * (`Helvetica`/WinAnsiEncoding, cobre acentuação portuguesa sem
 * precisar de embutir nenhuma fonte), sem assets externos, sem
 * armazenamento (stream para `Buffer` em memória, nunca `StorageObject`/
 * MinIO). Paginação automática do PDFKit quando o conteúdo excede uma
 * página — sem cabeçalho repetido por página (fora do âmbito desta
 * foundation).
 */
export function serializeMonthlyReportToPdf(
  report: MonthlyFinancialReport,
  options: SerializePdfOptions = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, compress: options.compress ?? true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text('Relatório Financeiro Mensal');
    doc.fontSize(10).fillColor('#555555').text(`Período: ${report.period.from} a ${report.period.to}`);
    doc.moveDown();

    doc.fillColor('#000000').fontSize(14).text('Resumo');
    doc.fontSize(10);
    doc.text(`Faturas ativas: ${report.totals.activeInvoiceCount}`);
    doc.text(`Faturas canceladas: ${report.totals.cancelledInvoiceCount}`);
    doc.text(`Total: ${report.totals.totalAmount} EUR`);
    doc.text(`Média por fatura: ${report.totals.averageAmount} EUR`);
    doc.moveDown();

    doc.fontSize(14).text('Comparação com o período anterior');
    doc.fontSize(10);
    doc.text(
      `Total: ${report.comparison.totalAmount.current} EUR (anterior: ${report.comparison.totalAmount.previous} EUR; ` +
        `variação ${report.comparison.totalAmount.absoluteChange} EUR, ${formatPercentage(report.comparison.totalAmount.percentageChange)}, ` +
        `${translateDirection(report.comparison.totalAmount.direction)})`,
    );
    doc.text(
      `Faturas ativas: ${report.comparison.activeInvoiceCount.current} (anterior: ${report.comparison.activeInvoiceCount.previous}; ` +
        `${translateDirection(report.comparison.activeInvoiceCount.direction)})`,
    );
    doc.moveDown();

    doc.fontSize(14).text('Destaques');
    doc.fontSize(10);
    const { insights } = report;
    if (insights.largestSupplier) {
      doc.text(`Maior fornecedor: ${insights.largestSupplier.supplierName} (${formatShare(insights.largestSupplier.share)} do total)`);
    }
    if (insights.largestCategory) {
      doc.text(`Maior categoria: ${insights.largestCategory.categoryName} (${formatShare(insights.largestCategory.share)} do total)`);
    }
    doc.text(
      `Concentração: top ${insights.supplierConcentration.topN} fornecedores ${formatShare(insights.supplierConcentration.share)}; ` +
        `top ${insights.categoryConcentration.topN} categorias ${formatShare(insights.categoryConcentration.share)}`,
    );
    doc.text(`Por pagar (Pendente + Vencida): ${insights.outstanding.count} fatura(s), ${insights.outstanding.totalAmount} EUR`);
    if (insights.largestExpense.invoice) {
      const invoice = insights.largestExpense.invoice;
      doc.text(`Maior fatura: ${invoice.issueDate} — ${invoice.supplierName}, ${invoice.totalAmount} EUR`);
    }
    if (insights.trend.comparison) {
      doc.text(
        `Tendência mensal (${insights.trend.previousMonth} → ${insights.trend.latestMonth}): ${formatShare(insights.trend.comparison.percentageChange)} (${translateDirection(insights.trend.comparison.direction)})`,
      );
    } else {
      doc.text('Tendência mensal: dados insuficientes para uma conclusão');
    }
    doc.moveDown();

    doc.fontSize(14).text('Análise financeira');
    doc.fontSize(10);
    if (report.analysis.results.length === 0) {
      doc.text('Sem conclusões aplicáveis neste período.');
    } else {
      for (const result of report.analysis.results) {
        const title = ANALYSIS_TITLES[result.id] ?? result.id;
        const conclusion = CONCLUSION_LABELS[result.conclusion] ?? result.conclusion;
        doc.text(`${title}: ${conclusion} (${describeAnalysisEvidence(result)})`);
      }
    }
    doc.moveDown();

    doc.fontSize(14).text('Detalhe das faturas');
    doc.fontSize(9);
    if (report.invoices.length === 0) {
      doc.text('Sem faturas neste período.');
    }
    for (const invoice of report.invoices) {
      doc.text(
        `${invoice.issueDate}  ${invoice.number ?? '—'}  ${invoice.supplierName}  ` +
          `${STATUS_LABELS[invoice.status] ?? invoice.status}  ${invoice.totalAmount} EUR`,
      );
    }

    doc.end();
  });
}
