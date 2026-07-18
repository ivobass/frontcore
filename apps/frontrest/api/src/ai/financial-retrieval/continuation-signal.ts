/**
 * Sinal de continuação conversacional (Fase 8.4) — mesmas formas dos
 * exemplos exigidos ("E a anterior?", "E dessas, quantas estão pagas?",
 * "E só da Hetzner?", "Mostra apenas as vencidas.", "E por categoria?",
 * "Qual foi a maior?"). Partilhado entre `FinancialRetrievalService`
 * (ativa a recuperação de filtros do histórico) e o classificador do
 * router (`financial-relevance.classifier.ts`, ativa a recuperação de
 * intenção/período do histórico mesmo sem sinal financeiro próprio) —
 * nunca duas definições divergentes do mesmo conceito.
 */
const CONTINUATION_SIGNAL_PATTERN =
  /^e\b|\bapenas\b|\bso\b|\bdessas?\b|\bdesses?\b|\ba anterior\b|\bo anterior\b|\ba maior\b|\bo maior\b/;

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

export function hasContinuationSignal(message: string): boolean {
  return CONTINUATION_SIGNAL_PATTERN.test(normalize(message));
}
