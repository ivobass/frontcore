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
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
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
    // Executa o callback com o próprio mock como "tx" — os testes
    // continuam a configurar invoice/invoiceAttachment/invoiceDraft
    // diretamente, sem precisar de um segundo objeto de transação.
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    (callback: (tx: typeof prisma) => unknown) => callback(prisma),
  );
  return prisma;
}

export type MockPrismaService = ReturnType<typeof createMockPrismaService>;
