/**
 * @frontcore/ai
 * Contrato genérico de provider de IA para FrontCore.
 * A implementação concreta (OCR, extração, chat) entra nas Fases 6/8.
 * O contrato é agnóstico ao fornecedor (Anthropic, OpenAI, etc.).
 */

export type AiProvider = 'anthropic' | 'openai' | 'mock';

/** Mensagem genérica de uma conversa. */
export interface AiMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/** Pedido genérico de completion. */
export interface AiCompletionRequest {
  messages: AiMessage[];
  maxTokens?: number;
}

/** Resposta genérica de completion. */
export interface AiCompletionResponse {
  content: string;
}

/** Configuração genérica de um provider de IA. */
export interface AiConfig {
  provider: AiProvider;
  apiKey: string;
}

/** Contrato de provider de IA (implementado nas Fases 6/8). */
export interface AiCompletionProvider {
  complete(request: AiCompletionRequest): Promise<AiCompletionResponse>;
}
