import { optionalEnv } from '@frontcore/config';

/**
 * Configuração do chat IA (Fase 8) — específica de `apps/frontrest`, não
 * de `packages/ai` (esse não conhece conversas nem histórico). Segue a
 * convenção `load<X>Config()` de `docs/CODING_STANDARDS.md`.
 */
export interface AiChatConfig {
  /** Quantas mensagens anteriores (USER+ASSISTANT) são enviadas ao provider em cada pedido. */
  historyLimit: number;
  /** Tamanho máximo (em caracteres) de uma mensagem enviada pelo utilizador. */
  maxMessageLength: number;
}

const DEFAULT_HISTORY_LIMIT = 20;
const DEFAULT_MAX_MESSAGE_LENGTH = 4000;

export function loadAiChatConfig(): AiChatConfig {
  const historyLimit = Number(optionalEnv('AI_CHAT_HISTORY_LIMIT', String(DEFAULT_HISTORY_LIMIT)));
  const maxMessageLength = Number(
    optionalEnv('AI_CHAT_MAX_MESSAGE_LENGTH', String(DEFAULT_MAX_MESSAGE_LENGTH)),
  );

  if (!Number.isInteger(historyLimit) || historyLimit <= 0) {
    throw new Error('AI_CHAT_HISTORY_LIMIT deve ser um número inteiro positivo.');
  }
  if (!Number.isInteger(maxMessageLength) || maxMessageLength <= 0) {
    throw new Error('AI_CHAT_MAX_MESSAGE_LENGTH deve ser um número inteiro positivo.');
  }

  return { historyLimit, maxMessageLength };
}
