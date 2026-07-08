import { requireEnv, optionalEnv } from '@frontcore/config';
import type { StorageConfig } from '../contracts';

/**
 * Lê a configuração de storage a partir do ambiente (nomes genéricos,
 * S3-compatível) — espelha `loadTokenConfig()` de `@frontcore/auth`.
 */
export function loadStorageConfig(): StorageConfig {
  return {
    endpoint: requireEnv('S3_ENDPOINT'),
    region: requireEnv('S3_REGION'),
    bucket: requireEnv('S3_BUCKET'),
    accessKey: requireEnv('S3_ACCESS_KEY'),
    secretKey: requireEnv('S3_SECRET_KEY'),
    forcePathStyle: optionalEnv('S3_FORCE_PATH_STYLE', 'true') === 'true',
  };
}
