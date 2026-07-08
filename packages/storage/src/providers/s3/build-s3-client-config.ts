import type { S3ClientConfig } from '@aws-sdk/client-s3';
import type { StorageConfig } from '../../contracts';

/** Traduz `StorageConfig` (genérico, FrontCore) para a configuração concreta do SDK AWS S3. */
export function buildS3ClientConfig(config: StorageConfig): S3ClientConfig {
  return {
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
  };
}
