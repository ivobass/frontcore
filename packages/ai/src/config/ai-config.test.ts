import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadAiConfig } from './ai-config';
import { AiConfigurationError } from '../errors';

const ENV_KEYS = [
  'AI_PROVIDER',
  'AI_MODEL',
  'AI_BASE_URL',
  'AI_TIMEOUT_MS',
  'AI_MAX_OUTPUT_TOKENS',
  'AI_RETRY_ATTEMPTS',
  'AI_RETRY_BACKOFF_MS',
  'OPENROUTER_API_KEY',
];

describe('loadAiConfig', () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      original[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  it('sem AI_PROVIDER definido, assume "mock" — sem exigir modelo nem credenciais', () => {
    const config = loadAiConfig();
    expect(config).toEqual({ provider: 'mock', timeoutMs: 30_000, maxOutputTokens: 1024, retryAttempts: 0, retryBackoffMs: 500 });
  });

  it('AI_PROVIDER=mock explícito, idêntico ao omisso', () => {
    process.env.AI_PROVIDER = 'mock';
    expect(loadAiConfig().provider).toBe('mock');
  });

  it('AI_PROVIDER=ollama sem AI_MODEL lança AiConfigurationError', () => {
    process.env.AI_PROVIDER = 'ollama';
    expect(() => loadAiConfig()).toThrow(AiConfigurationError);
    expect(() => loadAiConfig()).toThrow(/AI_MODEL/);
  });

  it('AI_PROVIDER=ollama com AI_MODEL usa AI_BASE_URL local por omissão', () => {
    process.env.AI_PROVIDER = 'ollama';
    process.env.AI_MODEL = 'qwen3:4b';

    const config = loadAiConfig();

    expect(config).toEqual({
      provider: 'ollama',
      model: 'qwen3:4b',
      baseUrl: 'http://localhost:11434',
      timeoutMs: 30_000,
      maxOutputTokens: 1024,
      retryAttempts: 0,
      retryBackoffMs: 500,
    });
  });

  it('AI_BASE_URL sobrepõe o default local quando definido (ollama)', () => {
    process.env.AI_PROVIDER = 'ollama';
    process.env.AI_MODEL = 'qwen3:4b';
    process.env.AI_BASE_URL = 'http://ollama.interno:11434';

    const config = loadAiConfig();

    expect(config).toMatchObject({ baseUrl: 'http://ollama.interno:11434' });
  });

  it('AI_PROVIDER=ollama nunca exige nem lê OPENROUTER_API_KEY', () => {
    process.env.AI_PROVIDER = 'ollama';
    process.env.AI_MODEL = 'qwen3:4b';
    // OPENROUTER_API_KEY propositadamente nunca definida.
    const config = loadAiConfig();
    expect(config).not.toHaveProperty('apiKey');
  });

  describe('AI_PROVIDER=openrouter', () => {
    it('sem AI_MODEL lança AiConfigurationError', () => {
      process.env.AI_PROVIDER = 'openrouter';
      process.env.OPENROUTER_API_KEY = 'sk-or-test';
      expect(() => loadAiConfig()).toThrow(AiConfigurationError);
      expect(() => loadAiConfig()).toThrow(/AI_MODEL/);
    });

    it('sem OPENROUTER_API_KEY lança AiConfigurationError', () => {
      process.env.AI_PROVIDER = 'openrouter';
      process.env.AI_MODEL = 'openai/gpt-4o-mini';
      expect(() => loadAiConfig()).toThrow(AiConfigurationError);
      expect(() => loadAiConfig()).toThrow(/OPENROUTER_API_KEY/);
    });

    it('com AI_MODEL e OPENROUTER_API_KEY usa o endpoint público do OpenRouter por omissão', () => {
      process.env.AI_PROVIDER = 'openrouter';
      process.env.AI_MODEL = 'openai/gpt-4o-mini';
      process.env.OPENROUTER_API_KEY = 'sk-or-test';

      const config = loadAiConfig();

      expect(config).toEqual({
        provider: 'openrouter',
        model: 'openai/gpt-4o-mini',
        apiKey: 'sk-or-test',
        baseUrl: 'https://openrouter.ai/api/v1',
        timeoutMs: 30_000,
        maxOutputTokens: 1024,
        retryAttempts: 0,
        retryBackoffMs: 500,
      });
    });

    it('AI_BASE_URL sobrepõe o endpoint público quando definido', () => {
      process.env.AI_PROVIDER = 'openrouter';
      process.env.AI_MODEL = 'openai/gpt-4o-mini';
      process.env.OPENROUTER_API_KEY = 'sk-or-test';
      process.env.AI_BASE_URL = 'https://gateway.interno/openrouter';

      const config = loadAiConfig();

      expect(config).toMatchObject({ baseUrl: 'https://gateway.interno/openrouter' });
    });
  });

  it('provider desconhecido lança AiConfigurationError, nunca chega ao provider', () => {
    process.env.AI_PROVIDER = 'openai';
    expect(() => loadAiConfig()).toThrow(AiConfigurationError);
    expect(() => loadAiConfig()).toThrow(/openai/);
  });

  it('AI_TIMEOUT_MS/AI_MAX_OUTPUT_TOKENS respeitam overrides válidos', () => {
    process.env.AI_TIMEOUT_MS = '5000';
    process.env.AI_MAX_OUTPUT_TOKENS = '256';

    const config = loadAiConfig();

    expect(config.timeoutMs).toBe(5000);
    expect(config.maxOutputTokens).toBe(256);
  });

  it('AI_TIMEOUT_MS inválido (não numérico) lança AiConfigurationError', () => {
    process.env.AI_TIMEOUT_MS = 'abc';
    expect(() => loadAiConfig()).toThrow(AiConfigurationError);
  });

  it('AI_MAX_OUTPUT_TOKENS inválido (≤ 0) lança AiConfigurationError', () => {
    process.env.AI_MAX_OUTPUT_TOKENS = '0';
    expect(() => loadAiConfig()).toThrow(AiConfigurationError);
  });

  describe('AI_RETRY_ATTEMPTS/AI_RETRY_BACKOFF_MS', () => {
    it('omissos, retryAttempts=0 (sem alteração de comportamento pré-Fase 8.2) e retryBackoffMs=500', () => {
      const config = loadAiConfig();
      expect(config.retryAttempts).toBe(0);
      expect(config.retryBackoffMs).toBe(500);
    });

    it('AI_RETRY_ATTEMPTS aceita 0 explícito (desliga retries)', () => {
      process.env.AI_RETRY_ATTEMPTS = '0';
      expect(loadAiConfig().retryAttempts).toBe(0);
    });

    it('AI_RETRY_ATTEMPTS respeita um override válido', () => {
      process.env.AI_RETRY_ATTEMPTS = '3';
      expect(loadAiConfig().retryAttempts).toBe(3);
    });

    it('AI_RETRY_ATTEMPTS negativo lança AiConfigurationError', () => {
      process.env.AI_RETRY_ATTEMPTS = '-1';
      expect(() => loadAiConfig()).toThrow(AiConfigurationError);
    });

    it('AI_RETRY_ATTEMPTS não inteiro lança AiConfigurationError', () => {
      process.env.AI_RETRY_ATTEMPTS = '1.5';
      expect(() => loadAiConfig()).toThrow(AiConfigurationError);
    });

    it('AI_RETRY_BACKOFF_MS respeita um override válido', () => {
      process.env.AI_RETRY_BACKOFF_MS = '1000';
      expect(loadAiConfig().retryBackoffMs).toBe(1000);
    });

    it('AI_RETRY_BACKOFF_MS inválido (≤ 0) lança AiConfigurationError', () => {
      process.env.AI_RETRY_BACKOFF_MS = '0';
      expect(() => loadAiConfig()).toThrow(AiConfigurationError);
    });
  });

  it('nenhuma variável AI_API_KEY (legado) é lida ou exigida por nenhum provider', () => {
    process.env.AI_PROVIDER = 'ollama';
    process.env.AI_MODEL = 'qwen3:4b';
    const config = loadAiConfig();
    expect(config).not.toHaveProperty('AI_API_KEY');
  });
});
