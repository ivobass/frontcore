import type { AiToolCall } from './ai-tool';

/**
 * Mensagem genérica de um pedido de completion — sem forma específica de
 * fornecedor. `role: 'tool'` (Fase 8.3) representa o resultado da
 * execução de uma tool, correlacionado com o `AiToolCall.id` que a
 * originou — `toolCallId`/`name` só têm sentido nesse papel, nunca em
 * `system`/`user`/`assistant`. `toolCalls` só tem sentido em
 * `role: 'assistant'` — quando essa mensagem é a que decidiu chamar uma
 * ou mais tools; obrigatório preservar ao reenviar essa mensagem num
 * pedido seguinte (protocolo OpenAI-compatible e Ollama nativo exigem
 * ambos que o `tool_calls` da mensagem assistant que originou a chamada
 * seja devolvido no histórico, nunca só `content`).
 */
export interface AiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Só presente quando `role === 'tool'` — correlaciona com o `AiToolCall.id` respondido. */
  toolCallId?: string;
  /** Só presente quando `role === 'tool'` — nome da tool executada. */
  name?: string;
  /** Só presente quando `role === 'assistant'` e esta mensagem chamou uma ou mais tools. */
  toolCalls?: AiToolCall[];
}
