import type { AiCompletionProvider, AiCompletionRequest, AiCompletionResponse } from '../contracts';
import { AiProviderError } from '../errors';

/**
 * Códigos considerados transitórios — só estes justificam nova
 * tentativa. `authentication`/`model_not_found`/`invalid_response` nunca
 * mudam de resultado ao repetir o mesmo pedido (erro de configuração/
 * pedido, não de rede) — reintentar só atrasaria a resposta de erro sem
 * nenhuma hipótese real de sucesso.
 */
const RETRYABLE_CODES = new Set(['timeout', 'provider_unavailable', 'rate_limit']);

function isRetryable(error: unknown): boolean {
  return error instanceof AiProviderError && RETRYABLE_CODES.has(error.code);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Decorator interno (Fase 8.2, nunca exportado do package) aplicado por
 * `createAiProvider()` a providers reais (nunca `mock`, que não falha) —
 * reintenta só erros transitórios (`timeout`/`provider_unavailable`/
 * `rate_limit`), com backoff exponencial (`retryBackoffMs *
 * 2^tentativa`). `retryAttempts=0` (omissão) devolve o provider
 * original sem qualquer alteração de comportamento — a Fase 8.2 nunca
 * muda o comportamento por omissão de um provider já em produção.
 * Preferido a duplicar a lógica de retry dentro de cada provider
 * concreto (`OllamaAiProvider`/`OpenRouterAiProvider`) — um único ponto
 * de aplicação serve qualquer provider futuro sem alteração.
 */
export function withRetries(
  provider: AiCompletionProvider,
  options: { retryAttempts: number; retryBackoffMs: number },
): AiCompletionProvider {
  if (options.retryAttempts <= 0) {
    return provider;
  }

  return {
    name: provider.name,
    async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
      let lastError: unknown;
      for (let attempt = 0; attempt <= options.retryAttempts; attempt += 1) {
        try {
          return await provider.complete(request);
        } catch (error) {
          lastError = error;
          const isLastAttempt = attempt === options.retryAttempts;
          if (isLastAttempt || !isRetryable(error)) {
            throw error;
          }
          await sleep(options.retryBackoffMs * 2 ** attempt);
        }
      }
      // Inalcançável (o loop sempre devolve ou lança) — só para o TypeScript confirmar o tipo de retorno.
      throw lastError;
    },
  };
}
