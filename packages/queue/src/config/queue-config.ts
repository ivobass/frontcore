import { requireEnv } from '@frontcore/config';
import type { QueueConfig } from '../contracts';

/**
 * Lê a configuração de filas a partir do ambiente. Segue a convenção
 * `load<X>Config()` já usada por `loadTokenConfig()` (`@frontcore/auth`) e
 * `loadStorageConfig()` (`@frontcore/storage`) — ver `docs/CODING_STANDARDS.md`.
 */
export function loadQueueConfig(): QueueConfig {
  return {
    redisUrl: requireEnv('REDIS_URL'),
  };
}
