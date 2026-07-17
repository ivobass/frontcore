import type { FinancialRetrievalResult } from './financial-retrieval.service';

const NO_INVOICES_LINE = 'Sem faturas confirmadas neste período.';

/** Tradução dos estados internos (`InvoiceStatus`) — nunca expor o enum bruto ao modelo. */
const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  PAID: 'Paga',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
};

function translateStatus(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

const SUPPORTED_QUERIES_HINT =
  'resumo financeiro, valores por pagar, valores por estado, despesas por categoria, principais fornecedores, evolução mensal';

/**
 * Constrói o bloco de dados/orientação da mensagem `system` a partir de um
 * `FinancialRetrievalResult` (Fase 8.1) — pura, sem I/O. Cada `kind`
 * produz um texto explícito e distinto (dados; não suportada; período em
 * falta; período ambíguo; erro interno) para o modelo nunca ter de
 * adivinhar porque não recebeu dados, e nunca tratar uma consulta válida
 * sem resultados como um erro técnico.
 */
export function buildFinancialContextMessage(result: FinancialRetrievalResult): string {
  switch (result.kind) {
    case 'UNSUPPORTED':
      return [
        'Pergunta fora das consultas financeiras disponíveis nesta conversa.',
        'Explica isso ao utilizador sem inventar dados e sem afirmar que executaste qualquer ação.',
        `Indica brevemente os tipos de perguntas suportadas: ${SUPPORTED_QUERIES_HINT}.`,
      ].join('\n');
    case 'PERIOD_MISSING':
      return [
        'A pergunta parece financeira, mas não foi possível identificar um período.',
        'Pede ao utilizador para indicar um período concreto (ex.: "este mês", "junho de 2026", "este ano") — nunca assumas o mês atual sem essa indicação.',
      ].join('\n');
    case 'PERIOD_AMBIGUOUS':
      return [
        'A pergunta parece financeira, mas o período indicado não foi possível interpretar com segurança.',
        'Pede ao utilizador para reformular o período de forma concreta (ex.: "este mês", "junho de 2026", "este ano") — nunca assumas o mês atual sem essa indicação.',
      ].join('\n');
    case 'ERROR':
      return 'Não foi possível obter os dados financeiros de momento, devido a um problema técnico. Informa o utilizador com clareza, sem inventar valores.';
    case 'DATA':
      return buildDataSection(result);
  }
}

function buildDataSection(result: Extract<FinancialRetrievalResult, { kind: 'DATA' }>): string {
  const { period, data } = result;
  const lines: string[] = [`Período consultado: ${period.from} a ${period.to}.`];

  switch (data.intent) {
    case 'FINANCIAL_SUMMARY': {
      const { totals } = data;
      if (totals.activeInvoiceCount === 0 && totals.cancelledInvoiceCount === 0) {
        lines.push(NO_INVOICES_LINE);
      } else {
        lines.push(
          `Faturas ativas: ${totals.activeInvoiceCount} (total: ${totals.totalAmount} EUR; média: ${totals.averageAmount} EUR).`,
          `Faturas canceladas: ${totals.cancelledInvoiceCount}.`,
        );
      }
      break;
    }
    case 'OUTSTANDING_BALANCE': {
      // Sempre presente, mesmo a zero — um valor zero nunca é omitido nem tratado como ausência de dados.
      lines.push(`Por pagar (Pendente + Vencida): ${data.outstandingCount} fatura(s), ${data.outstandingAmount} EUR.`);
      break;
    }
    case 'BY_STATUS': {
      if (data.byStatus.length === 0) {
        lines.push(NO_INVOICES_LINE);
      } else {
        lines.push(
          `Por estado: ${data.byStatus
            .map((row) => `${translateStatus(row.status)}: ${row.count} fatura(s), ${row.totalAmount} EUR`)
            .join('; ')}.`,
        );
      }
      break;
    }
    case 'BY_CATEGORY': {
      if (data.byCategory.length === 0) {
        lines.push(NO_INVOICES_LINE);
      } else {
        lines.push(
          `Por categoria: ${data.byCategory
            .map((row) => `${row.categoryName}: ${row.count} fatura(s), ${row.totalAmount} EUR`)
            .join('; ')}.`,
        );
      }
      break;
    }
    case 'TOP_SUPPLIERS': {
      if (data.topSuppliers.length === 0) {
        lines.push(NO_INVOICES_LINE);
      } else {
        lines.push(
          `Principais fornecedores: ${data.topSuppliers
            .map((row) => `${row.supplierName}: ${row.count} fatura(s), ${row.totalAmount} EUR`)
            .join('; ')}.`,
        );
      }
      break;
    }
    case 'MONTHLY_TREND': {
      if (data.monthlyTrend.length === 0) {
        lines.push(NO_INVOICES_LINE);
      } else {
        lines.push(
          `Evolução mensal: ${data.monthlyTrend
            .map((row) => `${row.month}: ${row.count} fatura(s), ${row.totalAmount} EUR`)
            .join('; ')}.`,
        );
      }
      break;
    }
  }

  return `Dados financeiros disponíveis:\n${lines.join('\n')}`;
}
