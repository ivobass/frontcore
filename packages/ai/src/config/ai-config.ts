import { optionalEnv, requireEnv } from '@frontcore/config';
import type { AiConfig, AiProviderName } from '../contracts';
import { AiConfigurationError } from '../errors';

const PROVIDER_NAMES: AiProviderName[] = ['mock', 'ollama', 'openrouter'];

/** Ollama local, sem fronteira de rede pública a autenticar — default seguro para desenvolvimento local. */
const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';

/** Endpoint público oficial do OpenRouter (API OpenAI-compatible). */
const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

const DEFAULT_RETRY_ATTEMPTS = 0;
const DEFAULT_RETRY_BACKOFF_MS = 500;

/** `requireEnv()` (`@frontcore/config`) lança `Error` genérico — rewrapped como `AiConfigurationError` para uma taxonomia única de erro de configuração neste package. */
function requireAiEnv(name: string): string {
  try {
    return requireEnv(name);
  } catch (error) {
    throw new AiConfigurationError(error instanceof Error ? error.message : `Variável de ambiente obrigatória em falta: ${name}`);
  }
}

function parseProviderName(raw: string): AiProviderName {
  if ((PROVIDER_NAMES as string[]).includes(raw)) {
    return raw as AiProviderName;
  }
  throw new AiConfigurationError(
    `Provider de IA desconhecido: "${raw}". Valores aceites: ${PROVIDER_NAMES.join(', ')}.`,
  );
}

/**
 * Lê e valida uma variável numérica opcional — só validação mínima
 * (finito, positivo), não um sistema genérico de schemas. Erro claro em
 * vez de `NaN`/valor negativo silenciosos a chegar ao provider.
 */
function parsePositiveNumberEnv(name: string, fallback: number): number {
  const raw = optionalEnv(name, String(fallback));
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new AiConfigurationError(`Configuração inválida: ${name}="${raw}" tem de ser um número positivo.`);
  }
  return value;
}

/** Como `parsePositiveNumberEnv()`, mas aceita `0` — `retryAttempts=0` é o valor válido que desliga os retries. */
function parseNonNegativeIntegerEnv(name: string, fallback: number): number {
  const raw = optionalEnv(name, String(fallback));
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new AiConfigurationError(`Configuração inválida: ${name}="${raw}" tem de ser um número inteiro ≥ 0.`);
  }
  return value;
}

/**
 * Lê a configuração de IA a partir do ambiente. Segue a convenção
 * `load<X>Config()` documentada em `docs/CODING_STANDARDS.md`. `mock`
 * nunca exige `AI_MODEL` nem credenciais. `ollama` exige `AI_MODEL` (sem
 * default permanente — evita acoplamento silencioso a um modelo
 * concreto que pode não estar descarregado localmente) e usa
 * `AI_BASE_URL` com um default local quando omisso; nunca lê
 * `OPENROUTER_API_KEY`. `openrouter` (Fase 8.2) exige `AI_MODEL` e
 * `OPENROUTER_API_KEY` (primeiro provider com credencial real — nunca
 * lida por `mock`/`ollama`), com `AI_BASE_URL` a assumir o endpoint
 * público do OpenRouter quando omisso. `retryAttempts`/`retryBackoffMs`
 * (Fase 8.2) são lidos sempre, independentemente do provider — a
 * factory (`createAiProvider()`) decide se os aplica.
 */
export function loadAiConfig(): AiConfig {
  const provider = parseProviderName(optionalEnv('AI_PROVIDER', 'mock'));
  const timeoutMs = parsePositiveNumberEnv('AI_TIMEOUT_MS', 30_000);
  const maxOutputTokens = parsePositiveNumberEnv('AI_MAX_OUTPUT_TOKENS', 1024);
  const retryAttempts = parseNonNegativeIntegerEnv('AI_RETRY_ATTEMPTS', DEFAULT_RETRY_ATTEMPTS);
  const retryBackoffMs = parsePositiveNumberEnv('AI_RETRY_BACKOFF_MS', DEFAULT_RETRY_BACKOFF_MS);

  if (provider === 'mock') {
    return { provider, timeoutMs, maxOutputTokens, retryAttempts, retryBackoffMs };
  }

  if (provider === 'ollama') {
    return {
      provider,
      model: requireAiEnv('AI_MODEL'),
      baseUrl: optionalEnv('AI_BASE_URL', DEFAULT_OLLAMA_BASE_URL),
      timeoutMs,
      maxOutputTokens,
      retryAttempts,
      retryBackoffMs,
    };
  }

  return {
    provider,
    model: requireAiEnv('AI_MODEL'),
    apiKey: requireAiEnv('OPENROUTER_API_KEY'),
    baseUrl: optionalEnv('AI_BASE_URL', DEFAULT_OPENROUTER_BASE_URL),
    timeoutMs,
    maxOutputTokens,
    retryAttempts,
    retryBackoffMs,
  };
}
