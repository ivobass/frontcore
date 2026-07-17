import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { OllamaAiConfig } from '../../contracts';
import { AiProviderError } from '../../errors';
import { OllamaAiProvider } from './ollama-ai-provider';

const config: OllamaAiConfig = {
  provider: 'ollama',
  baseUrl: 'http://localhost:11434',
  model: 'qwen3:4b',
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

describe('OllamaAiProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('declara o nome "ollama"', () => {
    expect(new OllamaAiProvider(config).name).toBe('ollama');
  });

  it('envia o pedido para POST /api/chat, com stream: false e options.num_predict', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ model: 'qwen3:4b', message: { role: 'assistant', content: 'OK' }, done: true }));
    const provider = new OllamaAiProvider(config);

    await provider.complete({ messages: [{ role: 'user', content: 'oi' }] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:11434/api/chat');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      model: 'qwen3:4b',
      messages: [{ role: 'user', content: 'oi' }],
      stream: false,
      options: { num_predict: 256 },
    });
  });

  describe('limite de output (options.num_predict)', () => {
    // Confirmado empiricamente contra o Ollama real: `options.num_predict`
    // é o único campo que a API de chat respeita para limitar geração —
    // não existe `max_tokens`/`max_output_tokens` de topo nesta API.
    it('envia AiConfig.maxOutputTokens em options.num_predict quando o pedido não sobrepõe', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ model: 'qwen3:4b', message: { content: 'ok' }, done: true }));
      const provider = new OllamaAiProvider({ ...config, maxOutputTokens: 50 });

      await provider.complete({ messages: [{ role: 'user', content: 'oi' }] });

      const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
      expect(body.options).toEqual({ num_predict: 50 });
    });

    it('request.maxOutputTokens sobrepõe AiConfig.maxOutputTokens em options.num_predict', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ model: 'qwen3:4b', message: { content: 'ok' }, done: true }));
      const provider = new OllamaAiProvider({ ...config, maxOutputTokens: 50 });

      await provider.complete({ messages: [{ role: 'user', content: 'oi' }], maxOutputTokens: 999 });

      const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
      expect(body.options).toEqual({ num_predict: 999 });
    });

    it('nunca duplica o limite num campo de topo alternativo (max_tokens/num_ctx/etc.)', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ model: 'qwen3:4b', message: { content: 'ok' }, done: true }));
      const provider = new OllamaAiProvider({ ...config, maxOutputTokens: 50 });

      await provider.complete({ messages: [{ role: 'user', content: 'oi' }] });

      const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
      expect(body).not.toHaveProperty('max_tokens');
      expect(body).not.toHaveProperty('maxOutputTokens');
      expect(body).not.toHaveProperty('num_predict');
      expect(Object.keys(body.options)).toEqual(['num_predict']);
    });
  });

  it('adapta AiMessage[] com vários papéis sem perder nenhuma mensagem', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ model: 'qwen3:4b', message: { content: 'ok' }, done: true }));
    const provider = new OllamaAiProvider(config);

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

  it('usa o modelo da configuração por omissão', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ model: 'qwen3:4b', message: { content: 'ok' }, done: true }));
    const provider = new OllamaAiProvider(config);

    await provider.complete({ messages: [{ role: 'user', content: 'oi' }] });

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.model).toBe('qwen3:4b');
  });

  it('request.model sobrepõe o modelo da configuração', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ model: 'codellama:latest', message: { content: 'ok' }, done: true }));
    const provider = new OllamaAiProvider(config);

    await provider.complete({ messages: [{ role: 'user', content: 'oi' }], model: 'codellama:latest' });

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.model).toBe('codellama:latest');
  });

  it('normaliza content/provider/model a partir da resposta real do Ollama', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ model: 'qwen3:4b', message: { role: 'assistant', content: 'resposta real' }, done: true }),
    );
    const provider = new OllamaAiProvider(config);

    const response = await provider.complete({ messages: [{ role: 'user', content: 'oi' }] });

    expect(response).toEqual({ content: 'resposta real', provider: 'ollama', model: 'qwen3:4b', usage: undefined });
  });

  it('normaliza usage a partir de prompt_eval_count/eval_count (campos planos, confirmado contra o Ollama real)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        model: 'qwen3:4b',
        message: { content: 'ok' },
        done: true,
        prompt_eval_count: 34,
        eval_count: 142,
      }),
    );
    const provider = new OllamaAiProvider(config);

    const response = await provider.complete({ messages: [{ role: 'user', content: 'oi' }] });

    expect(response.usage).toEqual({ inputTokens: 34, outputTokens: 142 });
  });

  it('sem contagem de tokens na resposta, usage fica undefined em vez de zeros inventados', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ model: 'qwen3:4b', message: { content: 'ok' }, done: true }));
    const provider = new OllamaAiProvider(config);

    const response = await provider.complete({ messages: [{ role: 'user', content: 'oi' }] });

    expect(response.usage).toBeUndefined();
  });

  it('resposta sem conteúdo lança AiProviderError code=invalid_response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ model: 'qwen3:4b', message: { content: '' }, done: true }));
    const provider = new OllamaAiProvider(config);

    await expect(provider.complete({ messages: [{ role: 'user', content: 'oi' }] })).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('JSON válido mas sem message.content (campo message ausente) lança code=invalid_response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ model: 'qwen3:4b', done: true }));
    const provider = new OllamaAiProvider(config);

    await expect(provider.complete({ messages: [{ role: 'user', content: 'oi' }] })).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  describe('resposta não interpretável (HTTP 200 com corpo inválido)', () => {
    it('HTTP 200 com JSON inválido nunca deixa escapar SyntaxError bruto — code=invalid_response', async () => {
      fetchMock.mockResolvedValue(new Response('<html>not json</html>', { status: 200 }));
      const provider = new OllamaAiProvider(config);

      const error = await provider
        .complete({ messages: [{ role: 'user', content: 'oi' }] })
        .catch((err: unknown) => err);

      expect(error).toBeInstanceOf(AiProviderError);
      expect((error as AiProviderError).code).toBe('invalid_response');
      expect((error as Error).message).not.toMatch(/<html>/);
    });

    it('HTTP 200 com corpo vazio lança code=invalid_response, nunca um SyntaxError bruto', async () => {
      fetchMock.mockResolvedValue(new Response('', { status: 200 }));
      const provider = new OllamaAiProvider(config);

      await expect(provider.complete({ messages: [{ role: 'user', content: 'oi' }] })).rejects.toMatchObject({
        code: 'invalid_response',
      });
    });
  });

  it('modelo inexistente (404, formato real confirmado: {"error":"model \'x\' not found"}) classifica como code=model_not_found, sem expor a resposta bruta', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "model 'inexistente:1b' not found" }, 404));
    const provider = new OllamaAiProvider(config);

    const error = await provider
      .complete({ messages: [{ role: 'user', content: 'oi' }] })
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(AiProviderError);
    expect((error as AiProviderError).code).toBe('model_not_found');
    expect((error as Error).message).not.toMatch(/inexistente/);
  });

  it('erro de servidor (500) classifica como code=provider_unavailable', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'internal error' }, 500));
    const provider = new OllamaAiProvider(config);

    await expect(provider.complete({ messages: [{ role: 'user', content: 'oi' }] })).rejects.toMatchObject({
      code: 'provider_unavailable',
    });
  });

  it('falha de conexão (fetch rejeita, ex. servidor Ollama parado) classifica como code=provider_unavailable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const provider = new OllamaAiProvider(config);

    await expect(provider.complete({ messages: [{ role: 'user', content: 'oi' }] })).rejects.toMatchObject({
      code: 'provider_unavailable',
    });
  });

  it('timeout cancela realmente o pedido via AbortController (signal chega ao fetch) e classifica code=timeout', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });
    const provider = new OllamaAiProvider({ ...config, timeoutMs: 50 });

    const result = provider.complete({ messages: [{ role: 'user', content: 'oi' }] });
    const assertion = expect(result).rejects.toMatchObject({ code: 'timeout' });

    await vi.advanceTimersByTimeAsync(50);
    await assertion;

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.signal as AbortSignal).aborted).toBe(true);
  });

  it('AI_BASE_URL com barra final não produz barra dupla no endpoint', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ model: 'qwen3:4b', message: { content: 'ok' }, done: true }));
    const provider = new OllamaAiProvider({ ...config, baseUrl: 'http://localhost:11434/' });

    await provider.complete({ messages: [{ role: 'user', content: 'oi' }] });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:11434/api/chat');
  });

  it('AI_BASE_URL com várias barras finais também é normalizado', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ model: 'qwen3:4b', message: { content: 'ok' }, done: true }));
    const provider = new OllamaAiProvider({ ...config, baseUrl: 'http://localhost:11434///' });

    await provider.complete({ messages: [{ role: 'user', content: 'oi' }] });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:11434/api/chat');
  });

  it('nunca faz uma chamada de rede real — fetch está sempre mockado neste ficheiro', () => {
    expect(vi.isMockFunction(fetch)).toBe(true);
  });
});
