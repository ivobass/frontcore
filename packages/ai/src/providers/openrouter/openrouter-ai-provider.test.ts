import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { OpenRouterAiConfig } from '../../contracts';
import { AiProviderError } from '../../errors';
import { OpenRouterAiProvider } from './openrouter-ai-provider';

const config: OpenRouterAiConfig = {
  provider: 'openrouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: 'sk-or-test-key',
  model: 'openai/gpt-4o-mini',
  timeoutMs: 5000,
  maxOutputTokens: 256,
  retryAttempts: 0,
  retryBackoffMs: 500,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('OpenRouterAiProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('declara o nome "openrouter"', () => {
    expect(new OpenRouterAiProvider(config).name).toBe('openrouter');
  });

  it('envia o pedido para POST {baseUrl}/chat/completions, com stream: false e max_tokens', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ model: 'openai/gpt-4o-mini', choices: [{ message: { role: 'assistant', content: 'OK' } }] }),
    );
    const provider = new OpenRouterAiProvider(config);

    await provider.complete({ messages: [{ role: 'user', content: 'oi' }] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'oi' }],
      stream: false,
      max_tokens: 256,
    });
  });

  it('inclui a API key no cabeçalho Authorization: Bearer, nunca no corpo do pedido', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    const provider = new OpenRouterAiProvider(config);

    await provider.complete({ messages: [{ role: 'user', content: 'oi' }] });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-or-test-key');
    const body = JSON.parse(init.body as string);
    expect(body).not.toHaveProperty('apiKey');
    expect(body).not.toHaveProperty('api_key');
  });

  it('request.maxOutputTokens sobrepõe AiConfig.maxOutputTokens em max_tokens', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    const provider = new OpenRouterAiProvider(config);

    await provider.complete({ messages: [{ role: 'user', content: 'oi' }], maxOutputTokens: 999 });

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.max_tokens).toBe(999);
  });

  it('request.model sobrepõe o modelo da configuração', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ model: 'anthropic/claude-3.5-sonnet', choices: [{ message: { content: 'ok' } }] }));
    const provider = new OpenRouterAiProvider(config);

    await provider.complete({ messages: [{ role: 'user', content: 'oi' }], model: 'anthropic/claude-3.5-sonnet' });

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.model).toBe('anthropic/claude-3.5-sonnet');
  });

  it('adapta AiMessage[] com vários papéis sem perder nenhuma mensagem', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    const provider = new OpenRouterAiProvider(config);

    await provider.complete({
      messages: [
        { role: 'system', content: 'sistema' },
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
        { role: 'user', content: 'c' },
      ],
    });

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.messages).toEqual([
      { role: 'system', content: 'sistema' },
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
    ]);
    expect(body.stream).toBe(false);
  });

  it('normaliza content/provider/model a partir da resposta real (formato OpenAI-compatible)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ model: 'openai/gpt-4o-mini', choices: [{ message: { role: 'assistant', content: 'resposta real' } }] }),
    );
    const provider = new OpenRouterAiProvider(config);

    const response = await provider.complete({ messages: [{ role: 'user', content: 'oi' }] });

    expect(response).toEqual({ content: 'resposta real', provider: 'openrouter', model: 'openai/gpt-4o-mini', usage: undefined });
  });

  it('normaliza usage a partir de usage.prompt_tokens/completion_tokens', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        model: 'openai/gpt-4o-mini',
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 34, completion_tokens: 142, total_tokens: 176 },
      }),
    );
    const provider = new OpenRouterAiProvider(config);

    const response = await provider.complete({ messages: [{ role: 'user', content: 'oi' }] });

    expect(response.usage).toEqual({ inputTokens: 34, outputTokens: 142 });
  });

  it('sem usage na resposta, usage fica undefined em vez de zeros inventados', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    const provider = new OpenRouterAiProvider(config);

    const response = await provider.complete({ messages: [{ role: 'user', content: 'oi' }] });

    expect(response.usage).toBeUndefined();
  });

  it('resposta sem conteúdo lança AiProviderError code=invalid_response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: '' } }] }));
    const provider = new OpenRouterAiProvider(config);

    await expect(provider.complete({ messages: [{ role: 'user', content: 'oi' }] })).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('JSON válido mas sem choices lança code=invalid_response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ model: 'openai/gpt-4o-mini' }));
    const provider = new OpenRouterAiProvider(config);

    await expect(provider.complete({ messages: [{ role: 'user', content: 'oi' }] })).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('HTTP 200 com JSON inválido nunca deixa escapar SyntaxError bruto — code=invalid_response', async () => {
    fetchMock.mockResolvedValue(new Response('<html>not json</html>', { status: 200 }));
    const provider = new OpenRouterAiProvider(config);

    const error = await provider.complete({ messages: [{ role: 'user', content: 'oi' }] }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(AiProviderError);
    expect((error as AiProviderError).code).toBe('invalid_response');
    expect((error as Error).message).not.toMatch(/<html>/);
  });

  it('401 classifica como code=authentication, sem expor a API key nem o corpo bruto', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'Invalid API key: sk-or-test-key' } }, 401));
    const provider = new OpenRouterAiProvider(config);

    const error = await provider.complete({ messages: [{ role: 'user', content: 'oi' }] }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(AiProviderError);
    expect((error as AiProviderError).code).toBe('authentication');
    expect((error as Error).message).not.toMatch(/sk-or-test-key/);
  });

  it('402 (saldo insuficiente — confirmado real contra o OpenRouter na validação manual da Fase 8.2) classifica como code=authentication', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { message: 'Provider returned error', code: 402, metadata: { provider_error_code: 'insufficient_quota' } } },
        402,
      ),
    );
    const provider = new OpenRouterAiProvider(config);

    await expect(provider.complete({ messages: [{ role: 'user', content: 'oi' }] })).rejects.toMatchObject({
      code: 'authentication',
    });
  });

  it('403 também classifica como code=authentication', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'forbidden' }, 403));
    const provider = new OpenRouterAiProvider(config);

    await expect(provider.complete({ messages: [{ role: 'user', content: 'oi' }] })).rejects.toMatchObject({
      code: 'authentication',
    });
  });

  it('429 classifica como code=rate_limit', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'rate limit exceeded' }, 429));
    const provider = new OpenRouterAiProvider(config);

    await expect(provider.complete({ messages: [{ role: 'user', content: 'oi' }] })).rejects.toMatchObject({
      code: 'rate_limit',
    });
  });

  it('404 classifica como code=model_not_found', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'model not found' }, 404));
    const provider = new OpenRouterAiProvider(config);

    await expect(provider.complete({ messages: [{ role: 'user', content: 'oi' }] })).rejects.toMatchObject({
      code: 'model_not_found',
    });
  });

  it('erro de servidor (500) classifica como code=provider_unavailable', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'internal error' }, 500));
    const provider = new OpenRouterAiProvider(config);

    await expect(provider.complete({ messages: [{ role: 'user', content: 'oi' }] })).rejects.toMatchObject({
      code: 'provider_unavailable',
    });
  });

  it('falha de conexão (fetch rejeita) classifica como code=provider_unavailable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const provider = new OpenRouterAiProvider(config);

    await expect(provider.complete({ messages: [{ role: 'user', content: 'oi' }] })).rejects.toMatchObject({
      code: 'provider_unavailable',
    });
  });

  it('timeout cancela realmente o pedido via AbortController e classifica code=timeout', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });
    const provider = new OpenRouterAiProvider({ ...config, timeoutMs: 50 });

    const result = provider.complete({ messages: [{ role: 'user', content: 'oi' }] });
    const assertion = expect(result).rejects.toMatchObject({ code: 'timeout' });

    await vi.advanceTimersByTimeAsync(50);
    await assertion;

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.signal as AbortSignal).aborted).toBe(true);
  });

  it('AI_BASE_URL com barra final não produz barra dupla no endpoint', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    const provider = new OpenRouterAiProvider({ ...config, baseUrl: 'https://openrouter.ai/api/v1/' });

    await provider.complete({ messages: [{ role: 'user', content: 'oi' }] });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
  });

  it('nunca faz uma chamada de rede real — fetch está sempre mockado neste ficheiro', () => {
    expect(vi.isMockFunction(fetch)).toBe(true);
  });
});
