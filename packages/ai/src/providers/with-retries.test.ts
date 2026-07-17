import { describe, it, expect, vi } from 'vitest';
import type { AiCompletionProvider } from '../contracts';
import { AiProviderError } from '../errors';
import { withRetries } from './with-retries';

const REQUEST = { messages: [{ role: 'user' as const, content: 'oi' }] };
const SUCCESS = { content: 'ok', provider: 'test', model: 'test-model' };

function buildProvider(complete: AiCompletionProvider['complete']): AiCompletionProvider {
  return { name: 'test', complete };
}

describe('withRetries', () => {
  it('retryAttempts=0 devolve o provider original, sem qualquer alteração', () => {
    const provider = buildProvider(vi.fn());
    expect(withRetries(provider, { retryAttempts: 0, retryBackoffMs: 10 })).toBe(provider);
  });

  it('sucesso na primeira tentativa nunca reintenta', async () => {
    const complete = vi.fn().mockResolvedValue(SUCCESS);
    const wrapped = withRetries(buildProvider(complete), { retryAttempts: 3, retryBackoffMs: 1 });

    const result = await wrapped.complete(REQUEST);

    expect(result).toEqual(SUCCESS);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('erro transitório (provider_unavailable) reintenta e devolve sucesso na 2ª tentativa', async () => {
    const complete = vi
      .fn()
      .mockRejectedValueOnce(new AiProviderError('indisponível', 'provider_unavailable'))
      .mockResolvedValueOnce(SUCCESS);
    const wrapped = withRetries(buildProvider(complete), { retryAttempts: 2, retryBackoffMs: 1 });

    const result = await wrapped.complete(REQUEST);

    expect(result).toEqual(SUCCESS);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it.each(['timeout', 'provider_unavailable', 'rate_limit'] as const)(
    'code=%s é retryable',
    async (code) => {
      const complete = vi.fn().mockRejectedValueOnce(new AiProviderError('falha', code)).mockResolvedValueOnce(SUCCESS);
      const wrapped = withRetries(buildProvider(complete), { retryAttempts: 1, retryBackoffMs: 1 });

      await expect(wrapped.complete(REQUEST)).resolves.toEqual(SUCCESS);
    },
  );

  it.each(['authentication', 'model_not_found', 'invalid_response', 'unknown'] as const)(
    'code=%s nunca reintenta — falha de configuração/pedido, não de rede',
    async (code) => {
      const complete = vi.fn().mockRejectedValue(new AiProviderError('falha', code));
      const wrapped = withRetries(buildProvider(complete), { retryAttempts: 3, retryBackoffMs: 1 });

      await expect(wrapped.complete(REQUEST)).rejects.toMatchObject({ code });
      expect(complete).toHaveBeenCalledTimes(1);
    },
  );

  it('esgota retryAttempts e lança o último erro, nunca um erro genérico substituto', async () => {
    const complete = vi.fn().mockRejectedValue(new AiProviderError('sempre indisponível', 'provider_unavailable'));
    const wrapped = withRetries(buildProvider(complete), { retryAttempts: 2, retryBackoffMs: 1 });

    await expect(wrapped.complete(REQUEST)).rejects.toMatchObject({
      code: 'provider_unavailable',
      message: 'sempre indisponível',
    });
    expect(complete).toHaveBeenCalledTimes(3); // 1ª tentativa + 2 retries
  });

  it('erro não-AiProviderError (ex. bug interno) nunca reintenta', async () => {
    const complete = vi.fn().mockRejectedValue(new Error('bug interno'));
    const wrapped = withRetries(buildProvider(complete), { retryAttempts: 3, retryBackoffMs: 1 });

    await expect(wrapped.complete(REQUEST)).rejects.toThrow('bug interno');
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('aplica backoff exponencial entre tentativas (retryBackoffMs * 2^tentativa)', async () => {
    vi.useFakeTimers();
    const complete = vi
      .fn()
      .mockRejectedValueOnce(new AiProviderError('falha', 'timeout'))
      .mockRejectedValueOnce(new AiProviderError('falha', 'timeout'))
      .mockResolvedValueOnce(SUCCESS);
    const wrapped = withRetries(buildProvider(complete), { retryAttempts: 2, retryBackoffMs: 100 });

    const resultPromise = wrapped.complete(REQUEST);

    await vi.advanceTimersByTimeAsync(100); // backoff da 1ª tentativa falhada (100 * 2^0)
    await vi.advanceTimersByTimeAsync(200); // backoff da 2ª tentativa falhada (100 * 2^1)
    const result = await resultPromise;

    expect(result).toEqual(SUCCESS);
    expect(complete).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('preserva o nome do provider original', () => {
    const provider = buildProvider(vi.fn());
    const wrapped = withRetries(provider, { retryAttempts: 1, retryBackoffMs: 1 });
    expect(wrapped.name).toBe('test');
  });
});
