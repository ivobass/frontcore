import type { FinancialIntentData, FinancialRetrievalResult } from './financial-retrieval.service';
import type { PeriodComparisonValue } from '../../dashboard/period-comparison.util';
import type { FinancialInsights } from '../../financial-insights/financial-insights.types';

const NO_INVOICES_LINE = 'Sem faturas confirmadas neste período.';

/** Tradução dos estados internos (`InvoiceStatus`) — nunca expor o enum bruto ao modelo. */
const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  PAID: 'Paga',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
};

/** Exportado (Fase 8.8) para `financial-grounding.validator.ts` — mesma tradução, nunca uma segunda cópia. */
export function translateStatus(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

const SUPPORTED_QUERIES_HINT =
  'resumo financeiro, valores por pagar, valores por estado, despesas por categoria, principais fornecedores, evolução mensal';

/** Nunca um "nome" desenhado para dominar o prompt — generoso para qualquer nome real de fornecedor/categoria, sem ser ilimitado. */
const MAX_DOMAIN_TEXT_LENGTH = 200;

/**
 * Neutraliza texto de domínio não confiável (Fase 8.8, Prompt Injection
 * Hardening) — nomes de fornecedor/categoria são dados escritos por
 * qualquer utilizador `MANAGER` da organização (`SuppliersService`/
 * `ExpenseCategoriesService`), nunca gerados por este código, por isso
 * tratados sempre como conteúdo não confiável antes de entrarem na
 * mensagem `system`/`tool` enviada ao modelo. Remove quebras de linha e
 * caracteres de controlo — a técnica estrutural mais comum para simular
 * uma nova instrução/parágrafo dentro do que devia ser só um valor — e
 * limita o comprimento. Nunca uma filtragem semântica de palavras-chave
 * (frágil, falsa sensação de segurança); esta é só a camada estrutural,
 * reforçada em paralelo pela regra explícita em `ASSISTANT_RULES`/
 * `TOOL_ATTEMPT_RULES` (`ai-tenant-context.service.ts`/
 * `ai-tool-orchestrator.service.ts`) que instrui o modelo a nunca tratar
 * estes nomes como instruções — defesa em profundidade, nunca uma única
 * camada.
 */
/** Exportado (Fase 8.8) para `financial-grounding.validator.ts` — mesma sanitização, nunca uma segunda cópia. */
export function sanitizeDomainText(text: string): string {
  // Substitui por espaço (nunca remove sem separador) — remover sem
  // substituir colaria as duas palavras à volta da quebra de linha
  // original ("Hetzner" + "IGNORA..." viraria "HetznerIGNORA...",
  // continuando a ler-se como uma frase só, o oposto do que se quer).
  const withoutControlChars = Array.from(text)
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code <= 0x1f || (code >= 0x7f && code <= 0x9f) ? ' ' : char;
    })
    .join('');
  const collapsedWhitespace = withoutControlChars.replace(/\s+/g, ' ').trim();
  return collapsedWhitespace.length > MAX_DOMAIN_TEXT_LENGTH
    ? `${collapsedWhitespace.slice(0, MAX_DOMAIN_TEXT_LENGTH)}…`
    : collapsedWhitespace;
}

/**
 * Bloco "Destaques" (Fase 8.9, Financial Insights) — só para a intenção
 * `FINANCIAL_SUMMARY`, única integração dos KPIs derivados no Chat. Todos
 * os valores vêm já calculados de `FinancialInsights` (nunca recalculados
 * aqui); cada linha só aparece quando o campo correspondente não é
 * `null` — "Por pagar" é a única exceção, sempre presente mesmo a zero
 * (mesma disciplina de `OUTSTANDING_BALANCE`, acima). Tendência com
 * `insufficient_data` produz sempre uma nota explícita, nunca uma
 * conclusão fabricada a partir de um único mês.
 */
function buildInsightsLines(insights: FinancialInsights): string[] {
  const lines: string[] = [];

  if (insights.largestSupplier) {
    const shareText = insights.largestSupplier.share !== null ? ` (${insights.largestSupplier.share}% do total)` : '';
    lines.push(`Maior fornecedor: ${sanitizeDomainText(insights.largestSupplier.supplierName)}${shareText}.`);
  }
  if (insights.largestCategory) {
    const shareText = insights.largestCategory.share !== null ? ` (${insights.largestCategory.share}% do total)` : '';
    lines.push(`Maior categoria: ${sanitizeDomainText(insights.largestCategory.categoryName)}${shareText}.`);
  }
  if (insights.supplierConcentration.share !== null) {
    lines.push(
      `Concentração de fornecedores: os ${insights.supplierConcentration.topN} principais representam ${insights.supplierConcentration.share}% do total.`,
    );
  }
  if (insights.categoryConcentration.share !== null) {
    lines.push(
      `Concentração de categorias: as ${insights.categoryConcentration.topN} principais representam ${insights.categoryConcentration.share}% do total.`,
    );
  }
  lines.push(`Por pagar: ${insights.outstanding.count} fatura(s), ${insights.outstanding.totalAmount} EUR.`);
  if (insights.largestExpense.invoice) {
    const invoice = insights.largestExpense.invoice;
    lines.push(
      `Maior fatura: ${invoice.issueDate} — ${sanitizeDomainText(invoice.supplierName)} (${sanitizeDomainText(invoice.categoryName)}, ${translateStatus(invoice.status)}): ${invoice.totalAmount} EUR.`,
    );
  }
  if (insights.trend.direction === 'insufficient_data' || !insights.trend.comparison) {
    lines.push('Tendência mensal: dados insuficientes para uma conclusão.');
  } else {
    const { comparison, latestMonth, previousMonth } = insights.trend;
    const percentagePart =
      comparison.percentageChange === null
        ? 'variação percentual não aplicável (mês anterior é zero)'
        : `${comparison.percentageChange}% de ${DIRECTION_LABELS[comparison.direction]}`;
    lines.push(
      `Tendência mensal: ${latestMonth} (${comparison.current} EUR) face a ${previousMonth} (${comparison.previous} EUR) — ${percentagePart}.`,
    );
  }

  return lines;
}

/**
 * Constrói o bloco de dados da mensagem `system` a partir de um resultado
 * `DATA` do retrieval financeiro — pura, sem I/O. Só chamada quando o
 * `provider` vai mesmo ser invocado (Fase 8.3: os outros 4 `kind` nunca
 * chegam a esta função nem ao provider — ver `buildDeterministicReply()`).
 */
export function buildFinancialContextMessage(result: Extract<FinancialRetrievalResult, { kind: 'DATA' }>): string {
  const { data, filters } = result;

  // Fase 8.6 — dois períodos, nunca cabe na linha genérica "Período
  // consultado" (pensada para um único período) — bloco próprio.
  if (data.intent === 'PERIOD_COMPARISON') {
    return buildPeriodComparisonMessage(data, filters);
  }

  const { period } = result;
  const lines: string[] = [`Período consultado: ${period.from} a ${period.to}.`];
  const filtersLine = buildFiltersLine(filters);
  if (filtersLine) {
    lines.push(filtersLine);
  }

  switch (data.intent) {
    case 'FINANCIAL_SUMMARY': {
      const { totals, insights } = data;
      if (totals.activeInvoiceCount === 0 && totals.cancelledInvoiceCount === 0) {
        lines.push(NO_INVOICES_LINE);
      } else {
        lines.push(
          `Faturas ativas: ${totals.activeInvoiceCount} (total: ${totals.totalAmount} EUR; média: ${totals.averageAmount} EUR).`,
          `Faturas canceladas: ${totals.cancelledInvoiceCount}.`,
          ...buildInsightsLines(insights),
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
            .map((row) => `${sanitizeDomainText(row.categoryName)}: ${row.count} fatura(s), ${row.totalAmount} EUR`)
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
            .map((row) => `${sanitizeDomainText(row.supplierName)}: ${row.count} fatura(s), ${row.totalAmount} EUR`)
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
                `${invoice.issueDate} — ${sanitizeDomainText(invoice.supplierName)} (${sanitizeDomainText(invoice.categoryName)}, ${translateStatus(invoice.status)}): ${invoice.totalAmount} EUR`,
            )
            .join('; ')}.`,
        );
      }
      break;
    }
  }

  return `Dados financeiros disponíveis:\n${lines.join('\n')}`;
}

const DIRECTION_LABELS: Record<PeriodComparisonValue['direction'], string> = {
  increase: 'aumento',
  decrease: 'diminuição',
  unchanged: 'sem alteração',
};

/**
 * Bloco de dados de uma comparação entre dois períodos (Fase 8.6) —
 * `current`/`previous`/`absoluteChange`/`percentageChange`/`direction`
 * já vêm calculados por `compareAmount()`/`compareCount()` (nunca
 * recalculados aqui nem pelo modelo); esta função só traduz para texto
 * pt-PT, nunca expõe `direction` em inglês, nunca omite um valor zero.
 */
function buildPeriodComparisonMessage(
  data: Extract<FinancialIntentData, { intent: 'PERIOD_COMPARISON' }>,
  filters: Extract<FinancialRetrievalResult, { kind: 'DATA' }>['filters'],
): string {
  const { current, previous, comparison } = data;
  const lines: string[] = [
    `Período atual: ${current.period.from} a ${current.period.to} (total: ${current.totals.totalAmount} EUR; ${current.totals.activeInvoiceCount} fatura(s) ativa(s)).`,
    `Período anterior: ${previous.period.from} a ${previous.period.to} (total: ${previous.totals.totalAmount} EUR; ${previous.totals.activeInvoiceCount} fatura(s) ativa(s)).`,
  ];
  const filtersLine = buildFiltersLine(filters);
  if (filtersLine) {
    lines.push(filtersLine);
  }
  lines.push(describeComparison('Valor total', comparison.totalAmount, 'EUR'));
  lines.push(describeComparison('Número de faturas ativas', comparison.activeInvoiceCount, null));

  return `Dados financeiros disponíveis:\n${lines.join('\n')}`;
}

function describeComparison(label: string, value: PeriodComparisonValue, unit: string | null): string {
  const suffix = unit ? ` ${unit}` : '';
  const percentagePart =
    value.percentageChange === null
      ? 'variação percentual não aplicável (período anterior é zero)'
      : `${value.percentageChange}% de ${DIRECTION_LABELS[value.direction]}`;
  return `${label}: ${value.current}${suffix} (período anterior: ${value.previous}${suffix}; diferença: ${value.absoluteChange}${suffix}; ${percentagePart}).`;
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
    parts.push(`fornecedor ${sanitizeDomainText(filters.supplierName)}`);
  }
  if (filters.categoryName) {
    parts.push(`categoria ${sanitizeDomainText(filters.categoryName)}`);
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
