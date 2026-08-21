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
 *
 * Fase 6.14 — quando `request.responseFormat` está presente, devolve
 * sempre um JSON válido e mínimo (nunca texto livre) para provar que o
 * pedido/resposta de structured output atravessa o contrato genérico
 * sem alterações — nunca simula dados de nenhum domínio concreto
 * (`packages/ai` não sabe o que é uma fatura). Consumidores que
 * precisem de testar o SEU próprio schema (ex. `AiInvoiceExtractionV1`)
 * constroem o seu próprio `AiCompletionProvider` de teste com respostas
 * feitas à medida — este mock só garante a canalização genérica.
 */
export class MockAiProvider implements AiCompletionProvider {
  readonly name = 'mock';

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    if (request.responseFormat) {
      return {
        content: JSON.stringify({ mock: true, schema: request.responseFormat.name }),
        provider: this.name,
        model: MOCK_MODEL_ID,
      };
    }

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
