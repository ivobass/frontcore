import type { InvoiceStatus } from '@frontcore/database';

/**
 * Extração determinística de um filtro de estado explícito a partir de
 * uma mensagem (Fase 8.5) — pura, síncrona, sem I/O, sem conhecimento
 * de intenção financeira nem de histórico conversacional. Única fonte
 * de verdade para "esta mensagem pede explicitamente um estado" —
 * reutilizada tanto por `resolveFinancialIntent()` (só para decidir se
 * uma mensagem sem nenhum outro sinal merece o intent de fallback) como
 * por `FinancialRetrievalService` (mensagem atual e recuperação por
 * histórico) — nunca duplicada.
 *
 * Nunca importa nem chama `resolveFinancialIntent()` — a dependência é
 * sempre `financial-intent.resolver.ts → financial-filter.extractor.ts`,
 * nunca o inverso, para este módulo poder ser reutilizado no futuro sem
 * acoplamento a lógica de negócio.
 *
 * Exige sempre um sinal explícito de contagem/filtro (`quantas`/
 * `quantos`/`numero de`/`contagem`/`mostra(r)`/`lista(r)`/`so`/`apenas`)
 * antes da palavra de estado — nunca um estado isolado, para nunca criar
 * um falso positivo a partir de uma frase como "A fatura já está paga."
 * `PENDING` está incluído sem exclusão: a distinção com
 * `OUTSTANDING_BALANCE` (Pendente + Vencida combinado, Fase 8.3) nunca
 * depende da palavra "pendente" em si, só da presença deste sinal
 * explícito — "Existem faturas pendentes?"/"quanto tenho por pagar"
 * nunca contêm o sinal, por isso continuam a resolver via
 * `OUTSTANDING_PATTERN`, inalterado.
 */

// "numero d[ae] fac?tura" — hardening pós-validação manual, achado real:
// "qual é o número da factura paga?" (nomeando o estado na própria
// mensagem, sem depender de continuidade) não tinha nenhum sinal
// existente ("numero de" sozinho refere-se a uma contagem — "número DE
// faturas" —, uma preposição diferente de "número DA fatura"). Mesmo
// mecanismo, mesma disciplina de sinal explícito antes da palavra de
// estado — nunca um estado isolado.
const STATUS_FILTER_SIGNAL_PATTERN =
  /\b(?:quantas|quantos|numero de|numero d[ae] fac?tura|conta(?:gem)?|mostra(?:r)?|lista(?:r)?|so|apenas)\b.*?\b(pendentes?|pagas?|pagos?|vencidas?|canceladas?)\b/;

/**
 * Hardening pós-validação manual — achado real: uma continuação
 * elíptica ("E as pagas?", depois de um filtro "vencidas" já aplicado)
 * não tem nenhum dos sinais acima ("mostra"/"lista"/"quantas"/"só"/
 * "apenas") — sem esta forma reconhecida, o estado herdado da mensagem
 * anterior nunca era substituído (`FinancialRetrievalService.resolveFilters()`
 * só substitui o filtro herdado quando a mensagem atual resolve o seu
 * próprio). Padrão fechado e ancorado à mensagem inteira (`^...$`), nunca
 * em qualquer ponto do texto — cobre só esta forma elíptica exata ("E
 * as/os <estado>?"), nunca reabre o risco de falso positivo que o sinal
 * acima já evita (ex. "A fatura está vencida." continua sem sinal).
 */
const CONTINUATION_STATUS_PATTERN =
  /^e?\s*(?:as|os)\s+(pendentes?|pagas?|pagos?|vencidas?|canceladas?)\s*\??$/;

const STATUS_WORD_TO_ENUM: Record<string, InvoiceStatus> = {
  pendente: 'PENDING',
  pendentes: 'PENDING',
  paga: 'PAID',
  pagas: 'PAID',
  pago: 'PAID',
  pagos: 'PAID',
  vencida: 'OVERDUE',
  vencidas: 'OVERDUE',
  cancelada: 'CANCELLED',
  canceladas: 'CANCELLED',
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

/**
 * Devolve o estado explicitamente pedido pela mensagem, ou `undefined`
 * quando não há nenhum sinal de filtro explícito — nunca uma
 * adivinhação. Reconhece os 4 estados reais (`PENDING`/`PAID`/`OVERDUE`/
 * `CANCELLED`), sempre insensível a maiúsculas/minúsculas e acentos.
 */
export function resolveStatusFilter(message: string): InvoiceStatus | undefined {
  const normalized = normalize(message);
  const match = normalized.match(STATUS_FILTER_SIGNAL_PATTERN) ?? normalized.match(CONTINUATION_STATUS_PATTERN);
  return match ? STATUS_WORD_TO_ENUM[match[1]] : undefined;
}
