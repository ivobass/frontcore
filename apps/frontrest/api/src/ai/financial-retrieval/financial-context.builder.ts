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
 * Constrói o bloco de dados da mensagem `system` a partir de um resultado
 * `DATA` do retrieval financeiro — pura, sem I/O. Só chamada quando o
 * `provider` vai mesmo ser invocado (Fase 8.3: os outros 4 `kind` nunca
 * chegam a esta função nem ao provider — ver `buildDeterministicReply()`).
 */
export function buildFinancialContextMessage(result: Extract<FinancialRetrievalResult, { kind: 'DATA' }>): string {
  const { period, data, filters } = result;
  const lines: string[] = [`Período consultado: ${period.from} a ${period.to}.`];
  const filtersLine = buildFiltersLine(filters);
  if (filtersLine) {
    lines.push(filtersLine);
  }

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
    case 'LARGEST_INVOICES': {
      if (data.invoices.length === 0) {
        lines.push(NO_INVOICES_LINE);
      } else {
        lines.push(
          `Maiores faturas: ${data.invoices
            .map(
              (invoice) =>
                `${invoice.issueDate} — ${invoice.supplierName} (${invoice.categoryName}, ${translateStatus(invoice.status)}): ${invoice.totalAmount} EUR`,
            )
            .join('; ')}.`,
        );
      }
      break;
    }
  }

  return `Dados financeiros disponíveis:\n${lines.join('\n')}`;
}

/**
 * Descreve os filtros combinados aplicados (Fase 8.4) — estado/
 * fornecedor/categoria, sempre nomes já traduzidos/resolvidos, nunca
 * ids nem enums em inglês. `undefined` (sem nenhum filtro) não produz
 * nenhuma linha — o texto de dados fica idêntico ao anterior a esta
 * fase quando nenhum filtro é usado.
 */
function buildFiltersLine(filters: Extract<FinancialRetrievalResult, { kind: 'DATA' }>['filters']): string | null {
  const parts: string[] = [];
  if (filters.status) {
    parts.push(`estado ${translateStatus(filters.status)}`);
  }
  if (filters.supplierName) {
    parts.push(`fornecedor ${filters.supplierName}`);
  }
  if (filters.categoryName) {
    parts.push(`categoria ${filters.categoryName}`);
  }
  if (parts.length === 0) {
    return null;
  }
  return `Filtros aplicados: ${parts.join('; ')}.`;
}

/**
 * Resposta final, pt-PT, para os `kind` que nunca chegam ao provider
 * (Fase 8.3, `ENTITY_AMBIGUOUS` na Fase 8.4) — texto já pronto para ser
 * persistido diretamente como a mensagem `ASSISTANT`, não uma instrução
 * para o modelo. Elimina estruturalmente a possibilidade de
 * alucinação nestes caminhos: sem dados financeiros estruturados, não
 * há chamada ao LLM nenhuma. Compromisso assumido: uma pergunta
 * genuinamente fora do domínio financeiro recebe sempre este mesmo
 * texto fixo, nunca uma recusa "conversacional" gerada pelo modelo —
 * ver `docs/phases/phase-8.3-ai-tools-function-calling-foundation.md`.
 */
export function buildDeterministicReply(result: Exclude<FinancialRetrievalResult, { kind: 'DATA' }>): string {
  switch (result.kind) {
    case 'UNSUPPORTED':
      return `Não tenho essa informação disponível nesta conversa. Posso ajudar com: ${SUPPORTED_QUERIES_HINT}.`;
    case 'PERIOD_MISSING':
      return 'Preciso que indiques um período concreto para responder (ex.: "este mês", "junho de 2026", "este ano").';
    case 'PERIOD_AMBIGUOUS':
      return 'Não consegui perceber o período que indicaste. Podes reformular de forma mais concreta (ex.: "este mês", "junho de 2026", "este ano")?';
    case 'ENTITY_AMBIGUOUS':
      return 'Encontrei mais do que um fornecedor ou categoria com esse nome. Podes indicar o nome completo?';
    case 'ERROR':
      return 'Não foi possível obter os dados financeiros de momento. Tenta novamente.';
  }
}
