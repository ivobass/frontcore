/** Mock reutilizável de `QueueProducer` para os testes e2e — nenhum teste liga a Redis real. */
export function createMockQueueProducer() {
  return {
    add: jest.fn(),
    close: jest.fn(),
  };
}

export type MockQueueProducer = ReturnType<typeof createMockQueueProducer>;
