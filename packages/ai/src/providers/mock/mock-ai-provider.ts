import type { AiCompletionProvider, AiCompletionRequest, AiCompletionResponse } from '../../contracts';

const MOCK_MODEL_ID = 'mock-echo-1';
const MOCK_TOOL_CALL_ID = 'mock-tool-call-1';

/**
 * Provider determinístico, sem I/O — para testes, desenvolvimento local
 * e futuros testes de consumidores sem depender de nenhum provider
 * cloud nem de `AI_API_KEY`. Nunca simula inteligência real: devolve
 * sempre a última mensagem do pedido, prefixada, para o resultado ser
 * previsível e fácil de fazer asserções sobre ele.
 *
 * Fase 8.3 — quando `request.tools` está presente e a conversa ainda não
 * tem nenhuma mensagem `role: 'tool'` (primeira volta do round-trip),
 * simula deterministicamente uma chamada à primeira tool oferecida —
 * nunca escolhe por "inteligência", só pela posição, para o resultado
 * continuar previsível em testes. Depois de uma mensagem `tool` já
 * existir (segunda volta), volta ao comportamento normal de eco.
 */
export class MockAiProvider implements AiCompletionProvider {
  readonly name = 'mock';

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    const hasToolResult = request.messages.some((message) => message.role === 'tool');
    if (request.tools && request.tools.length > 0 && !hasToolResult) {
      const tool = request.tools[0];
      const args = 'period' in tool.parameters.properties ? { period: 'este mês' } : {};
      return {
        content: '',
        provider: this.name,
        model: MOCK_MODEL_ID,
        toolCalls: [{ id: MOCK_TOOL_CALL_ID, name: tool.name, arguments: JSON.stringify(args) }],
      };
    }

    const lastMessage = request.messages[request.messages.length - 1];
    return {
      content: lastMessage ? `[mock] ${lastMessage.content}` : '[mock] (sem mensagens)',
      provider: this.name,
      model: MOCK_MODEL_ID,
    };
  }
}
