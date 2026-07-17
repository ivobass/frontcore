import type { AiMessage } from './ai-message';
import type { AiToolCall, AiToolDefinition } from './ai-tool';

/**
 * Pedido normalizado de completion — mesma forma independentemente do
 * provider. `model`/`maxOutputTokens` ausentes usam o valor de
 * `AiConfig` com que o provider foi construído; presentes, sobrepõem-no
 * para este pedido específico. Sem `temperature` nesta fase — nenhum
 * consumidor real a pede ainda; campo aditivo, fácil de acrescentar sem
 * mudança breaking quando existir necessidade confirmada. `tools`
 * (Fase 8.3) é aditivo e opcional — ausente, o comportamento de qualquer
 * provider é idêntico ao anterior à Fase 8.3.
 */
export interface AiCompletionRequest {
  messages: AiMessage[];
  model?: string;
  maxOutputTokens?: number;
  tools?: AiToolDefinition[];
}

/** Consumo de tokens — só presente quando o provider o disponibiliza. */
export interface AiCompletionUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Resposta normalizada — `content` já é o texto final agregado (nunca a
 * estrutura bruta de blocos/eventos de um provider específico).
 * `provider`/`model` identificam o que foi efetivamente usado, mesmo
 * quando o pedido não os especificou. `content` pode ser `''` quando
 * `toolCalls` (Fase 8.3) está presente — o modelo escolheu chamar uma
 * tool em vez de responder diretamente nesta volta.
 */
export interface AiCompletionResponse {
  content: string;
  provider: string;
  model: string;
  usage?: AiCompletionUsage;
  toolCalls?: AiToolCall[];
}

/**
 * Contrato de um provider de IA para completions — genérico, sem
 * conhecimento de faturas, OCR ou qualquer domínio. Qualquer provider
 * concreto (mock, Ollama, e futuros — ex. OpenAI, Anthropic, Azure
 * OpenAI, OpenRouter, numa fase própria) implementa isto; consumidores
 * dependem só deste contrato, nunca de uma implementação concreta (ver
 * `createAiProvider()`).
 */
export interface AiCompletionProvider {
  /** Nome do provider (ex. "ollama", "mock") — usado em `AiCompletionResponse.provider` e nos logs. */
  readonly name: string;

  /** Executa um pedido de completion. Lança `AiProviderError` em falha. */
  complete(request: AiCompletionRequest): Promise<AiCompletionResponse>;
}
