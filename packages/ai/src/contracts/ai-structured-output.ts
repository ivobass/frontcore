/**
 * Vocabulário genérico de structured output / JSON Schema (Fase 6.14) —
 * mesma disciplina de `ai-tool.ts` (Fase 8.3): `packages/ai` não sabe
 * que schema é este nem o que representa, só o transporta até ao
 * provider concreto (que o traduz para o formato nativo do respetivo
 * endpoint) e devolve o texto (`AiCompletionResponse.content`) que o
 * chamador valida e faz parse por si — nunca aqui.
 */
export interface AiStructuredOutputDefinition {
  /** Identificador do schema (ex. `"ai_invoice_extraction_v1"`) — alguns providers exigem-no no pedido. */
  name: string;
  /** JSON Schema (subconjunto suportado pelo provider) que a resposta deve respeitar. */
  schema: Record<string, unknown>;
  /** Reforça validação estrita do lado do provider quando suportado (ex. OpenAI-compatible `strict: true`). Omisso = decisão do provider. */
  strict?: boolean;
}
