import type { AiCompletionProvider, AiCompletionRequest, AiCompletionResponse } from '../../contracts';

const MOCK_MODEL_ID = 'mock-echo-1';

/**
 * Provider determinístico, sem I/O — para testes, desenvolvimento local
 * e futuros testes de consumidores sem depender de nenhum provider
 * cloud nem de `AI_API_KEY`. Nunca simula inteligência real: devolve
 * sempre a última mensagem do pedido, prefixada, para o resultado ser
 * previsível e fácil de fazer asserções sobre ele.
 */
export class MockAiProvider implements AiCompletionProvider {
  readonly name = 'mock';

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    const lastMessage = request.messages[request.messages.length - 1];
    return {
      content: lastMessage ? `[mock] ${lastMessage.content}` : '[mock] (sem mensagens)',
      provider: this.name,
      model: MOCK_MODEL_ID,
    };
  }
}
