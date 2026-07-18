import { hasContinuationSignal } from '../financial-retrieval/continuation-signal';

export type MessageRelevance = 'FINANCIAL' | 'GENERAL';

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

/**
 * Vocabulário financeiro-adjacente (Fase 8.4) — deliberadamente
 * generoso: um falso positivo aqui só significa que a mensagem segue
 * pelo pipeline financeiro seguro (retrieval/tools/fallback
 * determinístico, nunca confiando em texto livre sem `DATA`); um falso
 * negativo é o risco real (deixaria uma pergunta financeira ser tratada
 * como geral). Por isso o vocabulário pende sempre para o lado mais
 * inclusivo — nunca o inverso.
 */
const FINANCIAL_ADJACENT_PATTERN =
  /\bfatura(s)?\b|\bpagament(o|os)\b|\bpagar\b|\bpago(s)?\b|\bpaga(s)?\b|\bpaguei\b|\bgastei\b|\bgasto(s)?\b|\bgastar\b|\bgastamos\b|\bdespesa(s)?\b|\bfornecedor(es)?\b|\bcategoria(s)?\b|\beuro(s)?\b|€|\bvalor(es)?\b|\btotal(is)?\b|\bcusto(s)?\b|\bdinheiro\b|\bdivida\b|\bvencida(s)?\b|\bpendente(s)?\b|\bcancelada(s)?\b|\bfinanceir[oa]\b|\bresumo\b|\bmedia\b|\borcamento\b|\breceita(s)?\b/;

/**
 * Classificação híbrida (Fase 8.4) — determinística e defensiva, nunca
 * o LLM (mesma disciplina de `resolveFinancialIntent()`/
 * `resolveFinancialPeriod()` desde a Fase 8.1). **A ausência de
 * correspondência num padrão de intenção nunca classifica uma
 * mensagem como `GENERAL`** — só a ausência de qualquer vocabulário
 * financeiro-adjacente, sem sinal de continuação apoiado em contexto
 * financeiro recente, é que classifica como `GENERAL`. Isto garante o
 * requisito explícito: "perguntas financeiras desconhecidas nunca são
 * tratadas como gerais apenas porque um regex falhou" — uma pergunta
 * financeira em vocabulário totalmente novo continua `FINANCIAL`
 * (cai no retrieval → tools → fallback determinístico, nunca texto
 * livre sem dados reais); só uma pergunta sem nenhum sinal financeiro
 * é que segue para o caminho geral, sem tools nem contexto da
 * organização.
 */
export function classifyMessageRelevance(message: string, recentUserMessages: string[]): MessageRelevance {
  const normalized = normalize(message);

  if (FINANCIAL_ADJACENT_PATTERN.test(normalized)) {
    return 'FINANCIAL';
  }

  // Uma continuação ("E só da Hetzner?", "Qual foi a maior?") só conta
  // como financeira quando existe contexto financeiro recente na
  // janela de histórico — nunca por si só (evita que "E depois?" fora
  // de qualquer conversa financeira force o caminho financeiro).
  if (hasContinuationSignal(message) && recentUserMessages.some((past) => FINANCIAL_ADJACENT_PATTERN.test(normalize(past)))) {
    return 'FINANCIAL';
  }

  return 'GENERAL';
}
