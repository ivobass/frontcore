/** Mock reutilizável de `ObjectStorage` para os testes e2e — nenhum teste liga a MinIO real. */
export function createMockObjectStorage() {
  return {
    put: jest.fn(),
    getDownloadUrl: jest.fn(),
    delete: jest.fn(),
  };
}

export type MockObjectStorage = ReturnType<typeof createMockObjectStorage>;
