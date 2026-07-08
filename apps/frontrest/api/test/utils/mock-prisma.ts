/**
 * Mock reutilizável de `PrismaService`, para testes unitários e e2e —
 * nenhum teste da Fase 4.4 vai contra uma base de dados real (ver
 * `docs/phases/phase-4.4-backend-tests.md`). Só cobre os métodos
 * efetivamente usados por `suppliers`/`expense-categories`/`invoices`.
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
  return {
    supplier: createModelMock(),
    expenseCategory: createModelMock(),
    invoice: createModelMock(),
  };
}

export type MockPrismaService = ReturnType<typeof createMockPrismaService>;
