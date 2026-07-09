import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { JobHandler, QueueConfig, QueueConsumer } from '../../contracts';
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
        await handler(job.data as T, job.id ?? '');
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
