import { Redis } from 'ioredis';
import type { QueueConfig } from '../../contracts';

/**
 * Constrói a ligação Redis partilhada por produtor/consumidor BullMQ.
 * `maxRetriesPerRequest: null` é exigido pelo BullMQ — sem isto, o
 * ioredis desiste de comandos bloqueantes usados internamente pelas
 * filas antes do BullMQ os poder gerir.
 */
export function buildRedisConnection(config: QueueConfig): Redis {
  return new Redis(config.redisUrl, { maxRetriesPerRequest: null });
}
