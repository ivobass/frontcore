import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { JobAttemptInfo, JobHandler, QueueConfig, QueueConsumer } from '../../contracts';
import { buildRedisConnection } from './build-redis-connection';

/**
 * Implementação de `QueueConsumer` sobre BullMQ. Cada `consume()` regista
 * um `Worker` novo — erros lançados pelo `handler` não são capturados
 * aqui de propósito: o BullMQ precisa de os receber para acionar retries
 * (`attempts`) e marcar o job como falhado.
 */
export class BullMQQueueConsumer implements QueueConsumer {
  private readonly connection: Redis;
  private readonly workers: Worker[] = [];

  constructor(config: QueueConfig) {
    this.connection = buildRedisConnection(config);
  }

  consume<T>(queueName: string, handler: JobHandler<T>): void {
    const worker = new Worker(
      queueName,
      async (job) => {
        // `attemptsStarted` já é incrementado pelo BullMQ (script
        // moveToActive) antes desta função correr — 1 na primeira
        // execução, 2 no primeiro retry, etc. Nunca uma contagem paralela.
        const attempt: JobAttemptInfo = {
          attemptNumber: job.attemptsStarted,
          maxAttempts: job.opts.attempts ?? 1,
        };
        await handler(job.data as T, job.id ?? '', attempt);
      },
      { connection: this.connection },
    );
    this.workers.push(worker);
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close()));
    this.connection.disconnect();
  }
}
