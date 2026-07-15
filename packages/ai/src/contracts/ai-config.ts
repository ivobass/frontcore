/** Providers realmente implementados — nunca um `string` solto (ver `loadAiConfig()`). */
export type AiProviderName = 'mock' | 'ollama';

interface AiConfigBase {
  timeoutMs: number;
  maxOutputTokens: number;
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

/** União discriminada por `provider` — só os providers de `AiProviderName`. */
export type AiConfig = MockAiConfig | OllamaAiConfig;
