/**
 * Mock reutilizável de `PrismaService`, para testes unitários e e2e —
 * nenhum teste da Fase 4.4/5.2/5.3/6.3 vai contra uma base de dados real
 * (ver `docs/phases/phase-4.4-backend-tests.md`). Só cobre os métodos
 * efetivamente usados por
 * `suppliers`/`expense-categories`/`invoices`/`uploads`/`invoice-attachments`/`invoice-drafts`.
 */
function createModelMock() {
  return {
    create: jest.fn(),
    createMany: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    // Usados por DashboardService (Fase 7) — nenhum outro consumidor hoje.
    aggregate: jest.fn(),
    groupBy: jest.fn(),
  };
}

export function createMockPrismaService() {
  const prisma = {
    supplier: createModelMock(),
    expenseCategory: createModelMock(),
    invoice: createModelMock(),
    storageObject: createModelMock(),
    invoiceAttachment: createModelMock(),
    invoiceDraft: createModelMock(),
    // Fase 6.14 — staging de linhas e metadata de extração por IA.
    invoiceDraftItem: createModelMock(),
    invoiceDraftAiExtraction: createModelMock(),
    // Usados por AiChatService (Fase 8) — nenhum outro consumidor hoje.
    aiConversation: createModelMock(),
    aiMessage: createModelMock(),
    // Executa o callback com o próprio mock como "tx" — os testes
    // continuam a configurar invoice/invoiceAttachment/invoiceDraft
    // diretamente, sem precisar de um segundo objeto de transação.
    $transaction: jest.fn(),
    // Fase 6.14, correção pós-revisão Codex — `InvoiceDraftsService.promote()`
    // usa `tx.$queryRaw` (`SELECT ... FOR UPDATE`) para bloquear a linha
    // do `InvoiceDraft` durante a transação (achado 6, lost update).
    // Resolve por omissão com uma linha "encontrada" — os testes que
    // querem provar o caso "não encontrado" sobrescrevem para `[]`.
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'locked' }]),
  };
  prisma.$transaction.mockImplementation(
    (callback: (tx: typeof prisma) => unknown) => callback(prisma),
  );
  return prisma;
}

export type MockPrismaService = ReturnType<typeof createMockPrismaService>;
