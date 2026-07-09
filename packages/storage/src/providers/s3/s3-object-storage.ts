import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  ObjectStorage,
  PutObjectInput,
  StorageConfig,
  StoredObject,
} from '../../contracts';
import { StorageError } from '../../errors';
import { assertValidKey } from '../../utils';
import { buildS3ClientConfig } from './build-s3-client-config';

/**
 * Implementação de `ObjectStorage` sobre o SDK AWS S3 — compatível com
 * MinIO (via `forcePathStyle`) e qualquer storage S3-compatível.
 *
 * Mantém dois clientes quando `config.endpoint` e `config.publicEndpoint`
 * divergem: `client` (endpoint interno) para `put`/`delete`, chamadas
 * reais servidor → storage; `signingClient` (endpoint público) usado
 * exclusivamente para assinar URLs em `getDownloadUrl` — construir um
 * `S3Client` não estabelece nenhuma ligação de rede por si só, a
 * assinatura SigV4 é computada localmente, por isso não há custo real em
 * ter uma segunda instância só para este fim. Evita `replace()` sobre o
 * URL já assinado, que invalidaria a assinatura.
 */
export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly signingClient: S3Client;
  private readonly bucket: string;

  constructor(config: StorageConfig) {
    this.client = new S3Client(buildS3ClientConfig(config));
    this.signingClient =
      config.publicEndpoint === config.endpoint
        ? this.client
        : new S3Client(buildS3ClientConfig(config, config.publicEndpoint));
    this.bucket = config.bucket;
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    assertValidKey(input.key);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
        }),
      );
      return {
        key: input.key,
        size: input.body.byteLength,
        contentType: input.contentType,
      };
    } catch (error) {
      throw new StorageError(`Falha ao guardar o objeto "${input.key}".`, { cause: error });
    }
  }

  async get(key: string): Promise<Buffer> {
    assertValidKey(key);
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const bytes = await response.Body!.transformToByteArray();
      return Buffer.from(bytes);
    } catch (error) {
      throw new StorageError(`Falha ao ler o objeto "${key}".`, { cause: error });
    }
  }

  async getDownloadUrl(key: string, expiresInSeconds: number): Promise<string> {
    assertValidKey(key);
    try {
      const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
      return await getSignedUrl(this.signingClient, command, { expiresIn: expiresInSeconds });
    } catch (error) {
      throw new StorageError(`Falha ao gerar URL de download para "${key}".`, { cause: error });
    }
  }

  async delete(key: string): Promise<void> {
    assertValidKey(key);
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      throw new StorageError(`Falha ao eliminar o objeto "${key}".`, { cause: error });
    }
  }
}
