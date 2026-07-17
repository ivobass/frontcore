import type { AiCompletionProvider, AiConfig } from '../contracts';
import { AiConfigurationError } from '../errors';
import { MockAiProvider } from './mock';
import { OllamaAiProvider } from './ollama';
import { OpenRouterAiProvider } from './openrouter';
import { withRetries } from './with-retries';

function buildProvider(config: AiConfig): AiCompletionProvider {
  switch (config.provider) {
    case 'mock':
      return new MockAiProvider();
    case 'ollama':
      return new OllamaAiProvider(config);
    case 'openrouter':
      return new OpenRouterAiProvider(config);
    default: {
      const unreachable: never = config;
      throw new AiConfigurationError(
        `Provider de IA desconhecido: "${(unreachable as AiConfig).provider}".`,
      );
    }
  }
}

/**
 * Seleciona e constrói o provider concreto a partir de `AiConfig.provider`
 * — mesmo padrão de `createOcrProvider()` (`@frontcore/ocr`). Um `case`
 * novo por provider; nada nos consumidores muda (confirmado na Fase 8.2:
 * adicionar `openrouter` não exigiu tocar em `AiChatService`/
 * `AiController`). `AiConfig` já é uma união discriminada só com
 * providers implementados (`AiProviderName`), por isso o `default` em
 * `buildProvider()` é defesa em profundidade (ex. um valor a contornar o
 * tipo em runtime), nunca um caminho alcançável a partir de
 * `loadAiConfig()`.
 *
 * `withRetries()` (Fase 8.2) envolve sempre o provider construído —
 * nunca aplicado a `mock` (nunca falha, envolvê-lo não traria nenhum
 * valor) nem a providers reais quando `retryAttempts` é `0` (omissão —
 * `withRetries()` devolve o provider original sem alteração nesse caso).
 */
export function createAiProvider(config: AiConfig): AiCompletionProvider {
  const provider = buildProvider(config);
  if (config.provider === 'mock') {
    return provider;
  }
  return withRetries(provider, { retryAttempts: config.retryAttempts, retryBackoffMs: config.retryBackoffMs });
}
