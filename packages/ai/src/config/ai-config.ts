import { optionalEnv, requireEnv } from '@frontcore/config';
import type { AiConfig, AiProviderName } from '../contracts';
import { AiConfigurationError } from '../errors';

const PROVIDER_NAMES: AiProviderName[] = ['mock', 'ollama'];

/** Ollama local, sem fronteira de rede pública a autenticar — default seguro para desenvolvimento local. */
const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';

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

/**
 * Lê a configuração de IA a partir do ambiente. Segue a convenção
 * `load<X>Config()` documentada em `docs/CODING_STANDARDS.md`. `mock`
 * nunca exige `AI_MODEL`; `ollama` exige-o (sem default permanente —
 * evita acoplamento silencioso a um modelo concreto que pode não estar
 * descarregado localmente), mas usa `AI_BASE_URL` com um default local
 * seguro quando omisso. Nenhum provider implementado hoje lê
 * `AI_API_KEY` — Ollama corre localmente, sem credencial a gerir.
 */
export function loadAiConfig(): AiConfig {
  const provider = parseProviderName(optionalEnv('AI_PROVIDER', 'mock'));
  const timeoutMs = parsePositiveNumberEnv('AI_TIMEOUT_MS', 30_000);
  const maxOutputTokens = parsePositiveNumberEnv('AI_MAX_OUTPUT_TOKENS', 1024);

  if (provider === 'mock') {
    return { provider, timeoutMs, maxOutputTokens };
  }

  return {
    provider,
    model: requireAiEnv('AI_MODEL'),
    baseUrl: optionalEnv('AI_BASE_URL', DEFAULT_OLLAMA_BASE_URL),
    timeoutMs,
    maxOutputTokens,
  };
}
