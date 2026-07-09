/** Configuração genérica de ligação a um broker de filas (Redis). */
export interface QueueConfig {
  redisUrl: string;
}

/** Opções de enfileiramento de um job. */
export interface EnqueueOptions {
  /** Identificador idempotente — dois `add()` com o mesmo `jobId` não duplicam o job. */
  jobId?: string;
  /** Atraso antes do job ficar disponível para consumo, em milissegundos. */
  delayMs?: number;
  /** Número de tentativas em caso de falha (inclui a primeira). */
  attempts?: number;
}

/** Job aceite para processamento. */
export interface EnqueuedJob {
  id: string;
}

/**
 * Lado produtor de uma fila — genérico, sem conhecimento do conteúdo do
 * payload nem do domínio que o usa.
 */
export interface QueueProducer {
  add<T>(queueName: string, payload: T, options?: EnqueueOptions): Promise<EnqueuedJob>;
  close(): Promise<void>;
}

/** Função que processa um job de uma fila. Lançar propaga para o retry do broker. */
export type JobHandler<T> = (payload: T, jobId: string) => Promise<void>;

/**
 * Lado consumidor de uma fila — genérico, sem conhecimento do conteúdo do
 * payload nem do domínio que o usa.
 */
export interface QueueConsumer {
  consume<T>(queueName: string, handler: JobHandler<T>): void;
  close(): Promise<void>;
}
