/** Providers realmente implementados — nunca um `string` solto (ver `loadAiConfig()`). */
export type AiProviderName = 'mock' | 'ollama' | 'openrouter';

interface AiConfigBase {
  timeoutMs: number;
  maxOutputTokens: number;
  /**
   * Tentativas adicionais (além da primeira) em erros transitórios
   * (`timeout`/`provider_unavailable`/`rate_limit`) — nunca em erros de
   * configuração/autenticação/resposta inválida (Fase 8.2,
   * `withRetries()`). `0` = comportamento anterior à Fase 8.2, sem
   * retries.
   */
  retryAttempts: number;
  /** Atraso base (ms) do backoff exponencial entre tentativas — ignorado quando `retryAttempts` é `0`. */
  retryBackoffMs: number;
}

/** `mock` nunca exige credenciais nem modelo — determinístico, sem I/O. */
export interface MockAiConfig extends AiConfigBase {
  provider: 'mock';
}

/**
 * Ollama corre localmente (`http://localhost:11434` por omissão) — sem
 * API key, por não haver fronteira de rede pública a autenticar.
 * `model`/`baseUrl` obrigatórios: sem default permanente para o modelo
 * (evita acoplamento silencioso a um modelo concreto que pode não estar
 * descarregado localmente); `baseUrl` tem um default local seguro (ver
 * `loadAiConfig()`), mas continua um campo explícito do contrato — um
 * `OllamaAiProvider` nunca assume o endpoint por si.
 */
export interface OllamaAiConfig extends AiConfigBase {
  provider: 'ollama';
  baseUrl: string;
  model: string;
}

/**
 * OpenRouter (Fase 8.2) — primeiro provider cloud, API OpenAI-compatible
 * (`POST {baseUrl}/chat/completions`). `apiKey`/`model` obrigatórios,
 * sem default (mesma disciplina do `model` do Ollama); `baseUrl` tem
 * default público (`https://openrouter.ai/api/v1`, ver `loadAiConfig()`)
 * mas continua explícito no contrato.
 */
export interface OpenRouterAiConfig extends AiConfigBase {
  provider: 'openrouter';
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** União discriminada por `provider` — só os providers de `AiProviderName`. */
export type AiConfig = MockAiConfig | OllamaAiConfig | OpenRouterAiConfig;
