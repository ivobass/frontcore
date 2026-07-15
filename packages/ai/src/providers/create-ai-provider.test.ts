import { describe, it, expect, vi } from 'vitest';
import type { AiConfig } from '../contracts';
import { AiConfigurationError } from '../errors';
import { createAiProvider } from './create-ai-provider';
import { MockAiProvider } from './mock';
import { OllamaAiProvider } from './ollama';

describe('createAiProvider', () => {
  it('provider "mock" devolve uma instância de MockAiProvider', () => {
    const provider = createAiProvider({ provider: 'mock', timeoutMs: 30_000, maxOutputTokens: 1024 });
    expect(provider).toBeInstanceOf(MockAiProvider);
    expect(provider.name).toBe('mock');
  });

  it('provider "ollama" devolve uma instância de OllamaAiProvider, sem nenhuma chamada de rede', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const provider = createAiProvider({
      provider: 'ollama',
      model: 'qwen3:4b',
      baseUrl: 'http://localhost:11434',
      timeoutMs: 30_000,
      maxOutputTokens: 1024,
    });

    expect(provider).toBeInstanceOf(OllamaAiProvider);
    expect(provider.name).toBe('ollama');
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('provider desconhecido (contornando o tipo) lança AiConfigurationError, nunca um provider silencioso', () => {
    const invalid = { provider: 'openai', timeoutMs: 1000, maxOutputTokens: 100 } as unknown as AiConfig;
    expect(() => createAiProvider(invalid)).toThrow(AiConfigurationError);
  });

  it('nenhuma referência a OpenAI no comportamento da factory', () => {
    expect(() =>
      createAiProvider({ provider: 'mock', timeoutMs: 1000, maxOutputTokens: 100 }),
    ).not.toThrow();
    const invalid = { provider: 'openai' } as unknown as AiConfig;
    expect(() => createAiProvider(invalid)).toThrow(/desconhecido/);
  });
});
