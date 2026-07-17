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

  describe('Fase 8.3 — simulação de tool calling', () => {
    const tools = [
      { name: 'get_financial_summary', description: 'x', parameters: { type: 'object' as const, properties: { period: {} } } },
      { name: 'get_top_suppliers', description: 'y', parameters: { type: 'object' as const, properties: { period: {} } } },
    ];

    it('com tools e sem mensagem "tool" anterior, chama sempre a primeira tool oferecida', async () => {
      const response = await provider.complete({
        messages: [{ role: 'user', content: 'Onde gasto mais?' }],
        tools,
      });

      expect(response.content).toBe('');
      expect(response.toolCalls).toEqual([
        { id: 'mock-tool-call-1', name: 'get_financial_summary', arguments: JSON.stringify({ period: 'este mês' }) },
      ]);
    });

    it('com uma mensagem "tool" já presente, volta ao eco normal — nunca chama outra tool', async () => {
      const response = await provider.complete({
        messages: [
          { role: 'user', content: 'Onde gasto mais?' },
          { role: 'assistant', content: '' },
          { role: 'tool', content: '{"totals":{}}', toolCallId: 'mock-tool-call-1', name: 'get_financial_summary' },
        ],
        tools,
      });

      expect(response.toolCalls).toBeUndefined();
      expect(response.content).toBe('[mock] {"totals":{}}');
    });

    it('sem tools no pedido, comportamento idêntico ao anterior à Fase 8.3', async () => {
      const response = await provider.complete({ messages: [{ role: 'user', content: 'Olá' }] });
      expect(response.toolCalls).toBeUndefined();
      expect(response.content).toBe('[mock] Olá');
    });
  });
});
