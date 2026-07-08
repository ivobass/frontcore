/**
 * Erro genérico de storage — normaliza falhas do provider concreto (ex.
 * SDK S3) para os consumidores não dependerem de tipos de erro
 * específicos de uma implementação.
 */
export class StorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageError';
  }
}
