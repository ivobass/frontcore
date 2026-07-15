import type { AiCompletionProvider, AiConfig } from '../contracts';
import { AiConfigurationError } from '../errors';
import { MockAiProvider } from './mock';
import { OllamaAiProvider } from './ollama';

/**
 * Seleciona e constrói o provider concreto a partir de `AiConfig.provider`
 * — mesmo padrão de `createOcrProvider()` (`@frontcore/ocr`). Um `case`
 * novo por provider; nada nos consumidores muda. `AiConfig` já é uma
 * união discriminada só com providers implementados (`AiProviderName`),
 * por isso o `default` abaixo é defesa em profundidade (ex. um valor a
 * contornar o tipo em runtime), nunca um caminho alcançável a partir de
 * `loadAiConfig()`.
 */
export function createAiProvider(config: AiConfig): AiCompletionProvider {
  switch (config.provider) {
    case 'mock':
      return new MockAiProvider();
    case 'ollama':
      return new OllamaAiProvider(config);
    default: {
      const unreachable: never = config;
      throw new AiConfigurationError(
        `Provider de IA desconhecido: "${(unreachable as AiConfig).provider}".`,
      );
    }
  }
}
