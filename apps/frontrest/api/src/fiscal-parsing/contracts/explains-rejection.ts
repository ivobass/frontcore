/**
 * Explicação de um candidato rejeitado — Fase 6.8+ ("false positive
 * hardening"). Deliberadamente pequena e à parte de `FiscalExtractor<T>`
 * (nunca um método obrigatório do contrato genérico) — só os
 * extractors que, na prática, produziram falsos positivos reais
 * (`InvoiceNumberExtractor`, `TotalsExtractor`) implementam isto; os
 * restantes seis continuam inalterados. Ver
 * `docs/ai/AI_BASE_PROMPT.md` secção 5 (YAGNI) — alterar o contrato
 * genérico de todos os 9 extractors para um diagnóstico usado só por
 * dois seria desproporcionado.
 */
export interface RejectionExplanation {
  /** O texto que foi considerado como candidato antes de ser rejeitado — nunca inventado, sempre um excerto real do OCR. */
  candidate: string;
  /** Motivo da rejeição, em prosa curta — para mostrar diretamente na ferramenta de diagnóstico. */
  reason: string;
}

/**
 * Implementada opcionalmente por um `FiscalExtractor<T>` capaz de
 * explicar porque rejeitou um candidato — só quando existiu de facto
 * um candidato a rejeitar (nunca chamado/usado para "não encontrei
 * nada de todo", esse caso já é adequadamente representado por
 * `extract()` devolver `null` sem mais contexto).
 */
export interface ExplainsRejection {
  explainRejection(ocrText: string): RejectionExplanation | null;
}

/** Type guard — permite a `FiscalParsingService` verificar isto sem `instanceof` nem acoplamento às classes concretas. */
export function explainsRejection(extractor: unknown): extractor is ExplainsRejection {
  return (
    typeof extractor === 'object' &&
    extractor !== null &&
    typeof (extractor as { explainRejection?: unknown }).explainRejection === 'function'
  );
}
