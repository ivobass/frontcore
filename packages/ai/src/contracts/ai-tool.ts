/**
 * Vocabulário genérico de tool calling (Fase 8.3) — descrição de uma
 * tool (JSON Schema, subconjunto: sempre um objeto) e de uma chamada
 * devolvida pelo modelo. `packages/ai` não sabe o que uma tool concreta
 * faz — só transporta a definição/chamada até quem as regista e executa
 * (`apps/frontrest/api`, nunca aqui).
 */
export interface AiToolParameterSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

export interface AiToolDefinition {
  name: string;
  description: string;
  parameters: AiToolParameterSchema;
}

/** Chamada de tool devolvida pelo provider — `arguments` é sempre o JSON em bruto, nunca já parseado (o chamador valida). */
export interface AiToolCall {
  id: string;
  name: string;
  arguments: string;
}
