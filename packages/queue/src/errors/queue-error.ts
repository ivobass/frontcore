/**
 * Erro genérico de fila — normaliza falhas do provider concreto (ex.
 * BullMQ/Redis) para os consumidores não dependerem de tipos de erro
 * específicos de uma implementação.
 */
export class QueueError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'QueueError';
  }
}
