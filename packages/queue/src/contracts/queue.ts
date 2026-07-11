/** Configuração genérica de ligação a um broker de filas (Redis). */
export interface QueueConfig {
  redisUrl: string;
}

/**
 * Atraso progressivo entre tentativas — genérico, mapeado 1:1 para o
 * mecanismo nativo de backoff do broker (ex. BullMQ), nunca reimplementado
 * manualmente pelo lado que consome esta interface.
 */
export interface BackoffOptions {
  /** "fixed": mesmo atraso em todas as tentativas. "exponential": atraso duplica a cada tentativa. */
  type: 'fixed' | 'exponential';
  /** Atraso base, em milissegundos (para "exponential", multiplicado a cada tentativa). */
  delayMs: number;
}

/** Opções de enfileiramento de um job. */
export interface EnqueueOptions {
  /** Identificador idempotente — dois `add()` com o mesmo `jobId` não duplicam o job. */
  jobId?: string;
  /** Atraso antes do job ficar disponível para consumo, em milissegundos. */
  delayMs?: number;
  /** Número de tentativas em caso de falha (inclui a primeira). */
  attempts?: number;
  /** Política de atraso entre tentativas — sem isto, o broker tenta novamente de imediato. */
  backoff?: BackoffOptions;
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

/**
 * Metadados da tentativa atual — refletem a contagem já mantida pelo
 * broker (ex. `Job.attemptsStarted`/`Job.opts.attempts` do BullMQ), nunca
 * uma contagem paralela mantida pelo consumidor.
 */
export interface JobAttemptInfo {
  /** Número da tentativa atual, 1-based (1 na primeira execução). */
  attemptNumber: number;
  /** Número máximo de tentativas configurado ao publicar o job. */
  maxAttempts: number;
}

/** Função que processa um job de uma fila. Lançar propaga para o retry do broker. */
export type JobHandler<T> = (payload: T, jobId: string, attempt: JobAttemptInfo) => Promise<void>;

/**
 * Lado consumidor de uma fila — genérico, sem conhecimento do conteúdo do
 * payload nem do domínio que o usa.
 */
export interface QueueConsumer {
  consume<T>(queueName: string, handler: JobHandler<T>): void;
  close(): Promise<void>;
}
