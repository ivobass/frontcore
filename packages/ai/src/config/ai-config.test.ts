import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadAiConfig } from './ai-config';
import { AiConfigurationError } from '../errors';

const ENV_KEYS = ['AI_PROVIDER', 'AI_MODEL', 'AI_BASE_URL', 'AI_TIMEOUT_MS', 'AI_MAX_OUTPUT_TOKENS'];

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
    expect(config).toEqual({ provider: 'mock', timeoutMs: 30_000, maxOutputTokens: 1024 });
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
    });
  });

  it('AI_BASE_URL sobrepõe o default local quando definido', () => {
    process.env.AI_PROVIDER = 'ollama';
    process.env.AI_MODEL = 'qwen3:4b';
    process.env.AI_BASE_URL = 'http://ollama.interno:11434';

    const config = loadAiConfig();

    expect(config).toMatchObject({ baseUrl: 'http://ollama.interno:11434' });
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

  it('nenhuma variável AI_API_KEY é lida ou exigida — Ollama corre localmente, sem credencial', () => {
    process.env.AI_PROVIDER = 'ollama';
    process.env.AI_MODEL = 'qwen3:4b';
    // AI_API_KEY propositadamente nunca definida — se loadAiConfig() a exigisse, isto lançaria.
    const config = loadAiConfig();
    expect(config).not.toHaveProperty('apiKey');
  });
});
