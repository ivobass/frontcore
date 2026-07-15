import { describe, it, expect } from 'vitest';
import { MockAiProvider } from './mock-ai-provider';

describe('MockAiProvider', () => {
  const provider = new MockAiProvider();

  it('declara o nome "mock"', () => {
    expect(provider.name).toBe('mock');
  });

  it('devolve a última mensagem prefixada, sem chamar nenhum SDK', async () => {
    const response = await provider.complete({
      messages: [
        { role: 'system', content: 'És um assistente.' },
        { role: 'user', content: 'Olá' },
      ],
    });

    expect(response.content).toBe('[mock] Olá');
    expect(response.provider).toBe('mock');
    expect(response.model).toBe('mock-echo-1');
    expect(response.usage).toBeUndefined();
  });

  it('determinístico — mesma entrada produz sempre a mesma saída', async () => {
    const request = { messages: [{ role: 'user' as const, content: 'teste' }] };
    const first = await provider.complete(request);
    const second = await provider.complete(request);
    expect(first).toEqual(second);
  });

  it('sem mensagens, devolve um conteúdo previsível em vez de lançar', async () => {
    const response = await provider.complete({ messages: [] });
    expect(response.content).toBe('[mock] (sem mensagens)');
  });
});
