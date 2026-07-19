import type { Prisma } from '@frontcore/database';
import type { FinancialIntentType } from './financial-intent.resolver';
import type { FinancialRetrievalResult, ResolvedFinancialFilters } from './financial-retrieval.service';

/** Único valor válido hoje — bump nesta constante (nunca reescrita in-place) é o único ponto de entrada de uma forma v2 futura. */
export const FINANCIAL_CONTEXT_VERSION = 1 as const;

const KNOWN_INTENTS = new Set<FinancialIntentType>([
  'FINANCIAL_SUMMARY',
  'OUTSTANDING_BALANCE',
  'BY_STATUS',
  'BY_CATEGORY',
  'TOP_SUPPLIERS',
  'MONTHLY_TREND',
  'LARGEST_INVOICES',
  'PERIOD_COMPARISON',
]);

const KNOWN_STATUSES = new Set<string>(['PENDING', 'PAID', 'OVERDUE', 'CANCELLED']);

/**
 * Snapshot versionado (Fase 8.7) da última intenção/período/filtros
 * financeiros resolvidos com sucesso (`kind === 'DATA'`) numa conversa —
 * persistido em `AiConversation.financialContext` (coluna `Json?`,
 * migration `add_ai_conversation_financial_context`). Substitui, como
 * fonte de recuperação, a nova análise de texto livre do histórico
 * recente já feita por `recoverIntent()`/`recoverPeriod()`/
 * `recoverFilters()` (`FinancialRetrievalService`, Fases 8.3/8.4) — essas
 * continuam a existir e a ser usadas exatamente como antes, mas só como
 * fallback para conversas sem snapshot ainda (anteriores a esta fase, ou
 * cuja primeira mensagem ainda não produziu nenhum `DATA`).
 *
 * Para `PERIOD_COMPARISON`, `period` é sempre o lado `current` da
 * comparação (mesma convenção de `FinancialRetrievalResult`, Fase 8.6) —
 * recuperar esse valor para uma pergunta de período único subsequente é
 * um comportamento herdado, não introduzido nem corrigido nesta fase
 * (idêntico ao que a recuperação por texto já produzia antes: uma
 * mensagem anterior "compara maio com junho" já resolvia a intenção
 * `PERIOD_COMPARISON` por `recoverIntent()`).
 */
export interface FinancialConversationContextV1 {
  version: typeof FINANCIAL_CONTEXT_VERSION;
  intent: FinancialIntentType;
  period: { from: string; to: string };
  filters: ResolvedFinancialFilters;
  recordedAt: string;
}

/**
 * Constrói o snapshot a persistir a partir de um resultado `DATA` real
 * (nunca de texto livre do modelo) — chamado por `AiChatService` tanto
 * para o caminho determinístico principal como para o caminho de tool
 * calling (Fase 8.3, via `AiToolOrchestratorResult.retrievalResult`).
 */
export function buildFinancialConversationContext(
  result: Extract<FinancialRetrievalResult, { kind: 'DATA' }>,
  now: Date = new Date(),
): FinancialConversationContextV1 {
  return {
    version: FINANCIAL_CONTEXT_VERSION,
    intent: result.data.intent,
    period: result.period,
    filters: result.filters,
    recordedAt: now.toISOString(),
  };
}

/**
 * Leitura defensiva do valor `Json?` bruto vindo do Prisma — nunca
 * confia na forma (coluna nova, conteúdo pode ser `null`, de uma versão
 * futura desconhecida, ou nunca ter sido escrita por este código).
 * Qualquer desvio da forma exata da v1 devolve `null` (tratado como "sem
 * contexto", nunca lança) — inclui deliberadamente uma versão
 * desconhecida (maior ou menor que 1): esta fase não faz nenhuma
 * migração automática entre versões, decisão explícita para uma fase
 * futura caso uma v2 venha a existir.
 */
export function parseFinancialConversationContext(
  raw: Prisma.JsonValue | null | undefined,
): FinancialConversationContextV1 | null {
  if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const value = raw as Record<string, unknown>;

  if (value.version !== FINANCIAL_CONTEXT_VERSION) {
    return null;
  }
  if (typeof value.intent !== 'string' || !KNOWN_INTENTS.has(value.intent as FinancialIntentType)) {
    return null;
  }
  if (!isValidPeriod(value.period)) {
    return null;
  }
  if (!isValidFilters(value.filters)) {
    return null;
  }
  if (typeof value.recordedAt !== 'string') {
    return null;
  }

  return {
    version: FINANCIAL_CONTEXT_VERSION,
    intent: value.intent as FinancialIntentType,
    period: value.period as { from: string; to: string },
    filters: value.filters as ResolvedFinancialFilters,
    recordedAt: value.recordedAt,
  };
}

function isValidPeriod(value: unknown): value is { from: string; to: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const period = value as Record<string, unknown>;
  return typeof period.from === 'string' && typeof period.to === 'string';
}

function isValidFilters(value: unknown): value is ResolvedFinancialFilters {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const filters = value as Record<string, unknown>;
  if (filters.status !== undefined && (typeof filters.status !== 'string' || !KNOWN_STATUSES.has(filters.status))) {
    return false;
  }
  const optionalStringFields: (keyof ResolvedFinancialFilters)[] = ['supplierId', 'supplierName', 'categoryId', 'categoryName'];
  return optionalStringFields.every((field) => filters[field] === undefined || typeof filters[field] === 'string');
}
