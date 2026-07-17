import { describe, it, expect, vi } from 'vitest';
import type { AiConfig } from '../contracts';
import { AiConfigurationError, AiProviderError } from '../errors';
import { createAiProvider } from './create-ai-provider';
import { MockAiProvider } from './mock';
import { OllamaAiProvider } from './ollama';
import { OpenRouterAiProvider } from './openrouter';

const BASE = { timeoutMs: 30_000, maxOutputTokens: 1024, retryAttempts: 0, retryBackoffMs: 500 };

describe('createAiProvider', () => {
  it('provider "mock" devolve uma instância de MockAiProvider', () => {
    const provider = createAiProvider({ provider: 'mock', ...BASE });
    expect(provider).toBeInstanceOf(MockAiProvider);
    expect(provider.name).toBe('mock');
  });

  it('provider "ollama" devolve uma instância de OllamaAiProvider (retryAttempts=0), sem nenhuma chamada de rede', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const provider = createAiProvider({
      provider: 'ollama',
      model: 'qwen3:4b',
      baseUrl: 'http://localhost:11434',
      ...BASE,
    });

    expect(provider).toBeInstanceOf(OllamaAiProvider);
    expect(provider.name).toBe('ollama');
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('provider "openrouter" devolve uma instância de OpenRouterAiProvider (retryAttempts=0), sem nenhuma chamada de rede', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const provider = createAiProvider({
      provider: 'openrouter',
      model: 'openai/gpt-4o-mini',
      apiKey: 'sk-or-test',
      baseUrl: 'https://openrouter.ai/api/v1',
      ...BASE,
    });

    expect(provider).toBeInstanceOf(OpenRouterAiProvider);
    expect(provider.name).toBe('openrouter');
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('provider desconhecido (contornando o tipo) lança AiConfigurationError, nunca um provider silencioso', () => {
    const invalid = { provider: 'openai', ...BASE } as unknown as AiConfig;
    expect(() => createAiProvider(invalid)).toThrow(AiConfigurationError);
  });

  it('nenhuma referência a OpenAI no comportamento da factory', () => {
    expect(() => createAiProvider({ provider: 'mock', ...BASE })).not.toThrow();
    const invalid = { provider: 'openai' } as unknown as AiConfig;
    expect(() => createAiProvider(invalid)).toThrow(/desconhecido/);
  });

  describe('withRetries — aplicação pela factory', () => {
    it('mock nunca é envolvido em withRetries, mesmo com retryAttempts > 0', () => {
      const provider = createAiProvider({ provider: 'mock', ...BASE, retryAttempts: 3 });
      expect(provider).toBeInstanceOf(MockAiProvider);
    });

    it('ollama com retryAttempts=0 devolve a instância original, não um wrapper', () => {
      const provider = createAiProvider({
        provider: 'ollama',
        model: 'qwen3:4b',
        baseUrl: 'http://localhost:11434',
        ...BASE,
        retryAttempts: 0,
      });
      expect(provider).toBeInstanceOf(OllamaAiProvider);
    });

    it('ollama com retryAttempts>0 reintenta erros transitórios de forma transparente ao consumidor', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response('erro', { status: 500 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ model: 'qwen3:4b', message: { content: 'ok' }, done: true }), { status: 200 }),
        );
      vi.stubGlobal('fetch', fetchMock);

      const provider = createAiProvider({
        provider: 'ollama',
        model: 'qwen3:4b',
        baseUrl: 'http://localhost:11434',
        ...BASE,
        retryAttempts: 1,
        retryBackoffMs: 1,
      });
      // Não é OllamaAiProvider diretamente — está envolvido por withRetries().
      expect(provider).not.toBeInstanceOf(OllamaAiProvider);
      expect(provider.name).toBe('ollama');

      const response = await provider.complete({ messages: [{ role: 'user', content: 'oi' }] });

      expect(response.content).toBe('ok');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      vi.unstubAllGlobals();
    });

    it('openrouter com retryAttempts>0 esgotado continua a lançar AiProviderError sanitizada', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response('erro', { status: 500 }));
      vi.stubGlobal('fetch', fetchMock);

      const provider = createAiProvider({
        provider: 'openrouter',
        model: 'openai/gpt-4o-mini',
        apiKey: 'sk-or-test',
        baseUrl: 'https://openrouter.ai/api/v1',
        ...BASE,
        retryAttempts: 1,
        retryBackoffMs: 1,
      });

      await expect(provider.complete({ messages: [{ role: 'user', content: 'oi' }] })).rejects.toBeInstanceOf(
        AiProviderError,
      );
      expect(fetchMock).toHaveBeenCalledTimes(2); // 1ª tentativa + 1 retry
      vi.unstubAllGlobals();
    });
  });
});
