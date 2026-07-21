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

/** Forma `YYYY-MM-DD` — mesma convenção de `ResolvedPeriod`/`resolvePeriod()` (`dashboard/period.util.ts`). */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
 *
 * Fase 8.8 — Financial Conversation Context Hardening: validação
 * reforçada (forma de data ISO real e calendário válido em
 * `period.from`/`period.to`, `recordedAt` parseável como data, campos
 * de filtro nunca strings vazias) e todo o corpo dentro de um
 * `try`/`catch` — nunca lança, mesmo perante um valor hostil ou
 * inesperado (ex. um getter que lança ao ser lido), garantia absoluta
 * exigida por esta fase, não só "não lança para os casos já
 * previstos". Nunca uma correção de arquitetura — mesma assinatura,
 * mesmo contrato, mesmo comportamento para todo o input já válido
 * antes desta fase.
 */
export function parseFinancialConversationContext(
  raw: Prisma.JsonValue | null | undefined,
): FinancialConversationContextV1 | null {
  try {
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
    if (typeof value.recordedAt !== 'string' || Number.isNaN(Date.parse(value.recordedAt))) {
      return null;
    }

    return {
      version: FINANCIAL_CONTEXT_VERSION,
      intent: value.intent as FinancialIntentType,
      period: value.period as { from: string; to: string },
      filters: value.filters as ResolvedFinancialFilters,
      recordedAt: value.recordedAt,
    };
  } catch {
    // Nunca lançar por um snapshot inválido/hostil — tratado exatamente
    // como "sem contexto" (mesmo caminho de fallback para reanálise por
    // texto, ver `FinancialRetrievalService.retrieve()`).
    return null;
  }
}

/**
 * `from`/`to` válidos exigem forma `YYYY-MM-DD` **e** calendário real
 * (nunca só a forma) — um valor como `"2026-13-45"` tem a forma certa
 * mas não é uma data real; aceitá-lo aqui deixaria
 * `resolvePeriod()` (`dashboard/period.util.ts`, chamado por
 * `FinancialRetrievalService` ao recuperar o período do snapshot)
 * lançar mais tarde, fora deste ponto de validação — nunca reutiliza
 * `resolvePeriod()` diretamente (essa lança `BadRequestException`,
 * incompatível com o contrato "nunca lança" deste módulo); reimplementa
 * só o mesmo teste de calendário, como predicado puro.
 */
function isValidIsoDateString(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isValidPeriod(value: unknown): value is { from: string; to: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const period = value as Record<string, unknown>;
  if (
    typeof period.from !== 'string' ||
    typeof period.to !== 'string' ||
    !isValidIsoDateString(period.from) ||
    !isValidIsoDateString(period.to)
  ) {
    return false;
  }
  // `from > to` nunca é um período válido — comparação de string é
  // suficiente e correta aqui (forma `YYYY-MM-DD`, largura fixa,
  // já confirmada acima por `isValidIsoDateString()`, ordena
  // lexicograficamente igual à ordem cronológica real). Sem esta
  // verificação, um snapshot assim ainda chegaria a
  // `resolvePeriod(previousContext.period.from, previousContext.period.to)`
  // (`FinancialRetrievalService`), que lança `BadRequestException`
  // exatamente por este motivo — nunca deixar chegar lá.
  return period.from <= period.to;
}

/** Nunca `undefined` (campo ausente, válido) nem uma string vazia/só espaços (sempre inválida — nunca um filtro "definido mas vazio"). */
function isValidOptionalNonEmptyString(value: unknown): boolean {
  return value === undefined || (typeof value === 'string' && value.trim().length > 0);
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
  return optionalStringFields.every((field) => isValidOptionalNonEmptyString(filters[field]));
}
