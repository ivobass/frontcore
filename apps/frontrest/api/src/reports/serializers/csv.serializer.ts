import type { MonthlyFinancialReport } from '../reports.service';
import type { FinancialAnalysisOutcome } from '../../financial-analysis/types';

/**
 * CSV escrito à mão (Fase 9) — sem dependência: RFC4180 é simples o
 * suficiente para não justificar um package só para isto. Delimitador
 * `;` (não `,`): no locale `pt-PT`, `,` é o separador decimal — o Excel
 * português espera `;` como separador de campos CSV, `,` produziria um
 * ficheiro mal interpretado. BOM UTF-8 no início — sem ele, o Excel
 * assume Latin-1 e desalinha os acentos portugueses.
 */
const DELIMITER = ';';
const BOM = '﻿';
const LINE_BREAK = '\r\n';

/** Local a `reports/` deliberadamente — evita tocar em `ai/` (Fase 8, fora do âmbito) só para partilhar 4 linhas. */
const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  PAID: 'Paga',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
};

/** Rótulos próprios do CSV (Fase 8.12) — duplicados deliberadamente entre serializers/frontend, mesma disciplina de `STATUS_LABELS` acima; nunca partilhados via um util novo. */
const ANALYSIS_TITLES: Record<FinancialAnalysisOutcome['id'], string> = {
  monthly_trend: 'Tendência mensal',
  relative_concentration: 'Concentração relativa',
};

const CONCLUSION_LABELS: Record<string, string> = {
  increase: 'Aumento face ao mês anterior',
  decrease: 'Redução face ao mês anterior',
  unchanged: 'Sem alteração face ao mês anterior',
  supplier_more_concentrated: 'Fornecedores mais concentrados do que categorias',
  category_more_concentrated: 'Categorias mais concentradas do que fornecedores',
  equally_concentrated: 'Concentração equivalente entre fornecedores e categorias',
};

/** Só apresenta os campos de evidência já devolvidos pelo motor — nunca recalcula nem infere nada a partir deles. */
function describeAnalysisEvidence(result: FinancialAnalysisOutcome): string {
  if (result.id === 'monthly_trend') {
    const { current, previous, percentageChange } = result.evidence;
    return `Atual ${current}, Anterior ${previous}${percentageChange !== null ? `, ${percentageChange}%` : ''}`;
  }
  const { supplierShare, categoryShare } = result.evidence;
  return `Fornecedores ${supplierShare}%, Categorias ${categoryShare}%`;
}

/**
 * Mitigação OWASP contra CSV injection: um campo cujo primeiro carácter
 * seja `=`, `+`, `-` ou `@` é interpretado como fórmula por alguns
 * leitores de CSV (incluindo o Excel) — prefixar com `'` faz o Excel
 * tratar o valor como texto puro, sem o executar.
 */
const FORMULA_PREFIXES = ['=', '+', '-', '@'];

function escapeCsvField(value: string): string {
  let field = value;
  if (FORMULA_PREFIXES.some((prefix) => field.startsWith(prefix))) {
    field = `'${field}`;
  }
  if (/[;"\r\n]/.test(field)) {
    field = `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

function csvRow(fields: Array<string | number>): string {
  return fields.map((field) => escapeCsvField(String(field))).join(DELIMITER);
}

export function serializeMonthlyReportToCsv(report: MonthlyFinancialReport): string {
  const lines: string[] = [];

  lines.push(csvRow(['Relatório Financeiro Mensal']));
  lines.push(csvRow(['Período', `${report.period.from} a ${report.period.to}`]));
  lines.push(csvRow(['Período anterior (comparação)', `${report.previousPeriod.from} a ${report.previousPeriod.to}`]));
  lines.push('');

  lines.push(csvRow(['Resumo']));
  lines.push(csvRow(['Faturas ativas', report.totals.activeInvoiceCount]));
  lines.push(csvRow(['Faturas canceladas', report.totals.cancelledInvoiceCount]));
  lines.push(csvRow(['Total', report.totals.totalAmount]));
  lines.push(csvRow(['Média por fatura', report.totals.averageAmount]));
  lines.push('');

  lines.push(csvRow(['Comparação com o período anterior']));
  lines.push(csvRow(['Métrica', 'Atual', 'Anterior', 'Variação absoluta', 'Variação percentual', 'Direção']));
  lines.push(
    csvRow([
      'Total',
      report.comparison.totalAmount.current,
      report.comparison.totalAmount.previous,
      report.comparison.totalAmount.absoluteChange,
      report.comparison.totalAmount.percentageChange === null
        ? 'Sem dados no período anterior'
        : `${report.comparison.totalAmount.percentageChange}%`,
      translateDirection(report.comparison.totalAmount.direction),
    ]),
  );
  lines.push(
    csvRow([
      'Número de faturas ativas',
      report.comparison.activeInvoiceCount.current,
      report.comparison.activeInvoiceCount.previous,
      report.comparison.activeInvoiceCount.absoluteChange,
      report.comparison.activeInvoiceCount.percentageChange === null
        ? 'Sem dados no período anterior'
        : `${report.comparison.activeInvoiceCount.percentageChange}%`,
      translateDirection(report.comparison.activeInvoiceCount.direction),
    ]),
  );
  lines.push('');

  lines.push(csvRow(['Por estado']));
  lines.push(csvRow(['Estado', 'Faturas', 'Total']));
  for (const row of report.byStatus) {
    lines.push(csvRow([STATUS_LABELS[row.status] ?? row.status, row.count, row.totalAmount]));
  }
  lines.push('');

  lines.push(csvRow(['Por categoria']));
  lines.push(csvRow(['Categoria', 'Faturas', 'Total']));
  for (const row of report.byCategory) {
    lines.push(csvRow([row.categoryName, row.count, row.totalAmount]));
  }
  lines.push('');

  lines.push(csvRow(['Principais fornecedores']));
  lines.push(csvRow(['Fornecedor', 'Faturas', 'Total']));
  for (const row of report.topSuppliers) {
    lines.push(csvRow([row.supplierName, row.count, row.totalAmount]));
  }
  lines.push('');

  lines.push(csvRow(['Destaques (Financial Insights)']));
  const { insights } = report;
  if (insights.largestSupplier) {
    lines.push(
      csvRow(['Maior fornecedor', insights.largestSupplier.supplierName, formatShare(insights.largestSupplier.share)]),
    );
  }
  if (insights.largestCategory) {
    lines.push(
      csvRow(['Maior categoria', insights.largestCategory.categoryName, formatShare(insights.largestCategory.share)]),
    );
  }
  lines.push(
    csvRow([`Concentração — top ${insights.supplierConcentration.topN} fornecedores`, formatShare(insights.supplierConcentration.share)]),
  );
  lines.push(
    csvRow([`Concentração — top ${insights.categoryConcentration.topN} categorias`, formatShare(insights.categoryConcentration.share)]),
  );
  lines.push(csvRow(['Por pagar (Pendente + Vencida)', insights.outstanding.count, insights.outstanding.totalAmount]));
  if (insights.largestExpense.invoice) {
    const invoice = insights.largestExpense.invoice;
    lines.push(csvRow(['Maior fatura', invoice.issueDate, invoice.supplierName, invoice.totalAmount]));
  }
  if (insights.trend.comparison) {
    lines.push(
      csvRow([
        `Tendência mensal (${insights.trend.previousMonth} → ${insights.trend.latestMonth})`,
        insights.trend.comparison.absoluteChange,
        insights.trend.comparison.percentageChange === null ? 'Sem dados no período anterior' : `${insights.trend.comparison.percentageChange}%`,
        translateDirection(insights.trend.comparison.direction),
      ]),
    );
  } else {
    lines.push(csvRow(['Tendência mensal', 'Dados insuficientes para uma conclusão']));
  }
  lines.push('');

  lines.push(csvRow(['Análise financeira']));
  if (report.analysis.results.length === 0) {
    lines.push(csvRow(['Sem conclusões aplicáveis neste período.']));
  } else {
    lines.push(csvRow(['Análise', 'Conclusão', 'Evidência']));
    for (const result of report.analysis.results) {
      lines.push(
        csvRow([
          ANALYSIS_TITLES[result.id] ?? result.id,
          CONCLUSION_LABELS[result.conclusion] ?? result.conclusion,
          describeAnalysisEvidence(result),
        ]),
      );
    }
  }
  lines.push('');

  lines.push(csvRow(['Detalhe das faturas']));
  lines.push(csvRow(['Número', 'Fornecedor', 'Categoria', 'Data de emissão', 'Data de vencimento', 'Estado', 'Montante']));
  for (const invoice of report.invoices) {
    lines.push(
      csvRow([
        invoice.number ?? '',
        invoice.supplierName,
        invoice.categoryName,
        invoice.issueDate,
        invoice.dueDate ?? '',
        STATUS_LABELS[invoice.status] ?? invoice.status,
        invoice.totalAmount,
      ]),
    );
  }

  return BOM + lines.join(LINE_BREAK);
}

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

/** `share` já vem normalizado a 2 casas (`financial-insights.util.ts`) — o "%" é acrescentado só aqui, na camada de apresentação. */
function formatShare(share: string | null): string {
  return share === null ? 'Sem dados' : `${share}%`;
}
