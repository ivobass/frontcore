import type { S3ClientConfig } from '@aws-sdk/client-s3';
import type { StorageConfig } from '../../contracts';

/**
 * Traduz `StorageConfig` (genérico, FrontCore) para a configuração
 * concreta do SDK AWS S3. `endpoint` é parametrizável — permite construir
 * o mesmo `S3ClientConfig` com um endpoint diferente do operacional
 * (`config.endpoint`), usado só para assinar URLs (ver `S3ObjectStorage`).
 */
export function buildS3ClientConfig(
  config: StorageConfig,
  endpoint: string = config.endpoint,
): S3ClientConfig {
  return {
    endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
  };
}
