import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type {
  EnqueueOptions,
  EnqueuedJob,
  QueueConfig,
  QueueProducer,
} from '../../contracts';
import { QueueError } from '../../errors';
import { buildRedisConnection } from './build-redis-connection';

/**
 * Implementação de `QueueProducer` sobre BullMQ. Uma fila BullMQ por
 * `queueName` usado, criada lazily e reutilizada entre chamadas a `add()`.
 */
export class BullMQQueueProducer implements QueueProducer {
  private readonly connection: Redis;
  private readonly queues = new Map<string, Queue>();

  constructor(config: QueueConfig) {
    this.connection = buildRedisConnection(config);
  }

  private getQueue(queueName: string): Queue {
    let queue = this.queues.get(queueName);
    if (!queue) {
      queue = new Queue(queueName, { connection: this.connection });
      this.queues.set(queueName, queue);
    }
    return queue;
  }

  async add<T>(queueName: string, payload: T, options?: EnqueueOptions): Promise<EnqueuedJob> {
    try {
      const job = await this.getQueue(queueName).add(queueName, payload, {
        jobId: options?.jobId,
        delay: options?.delayMs,
        attempts: options?.attempts,
      });
      return { id: job.id ?? '' };
    } catch (error) {
      throw new QueueError(`Falha ao enfileirar job em "${queueName}".`, { cause: error });
    }
  }

  async close(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    this.connection.disconnect();
  }
}
