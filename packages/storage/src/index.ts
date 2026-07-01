/**
 * @frontcore/storage
 * Contrato genérico de storage de objetos (S3-compatível) para FrontCore.
 * A implementação concreta sobre MinIO/S3 entra na Fase 5.
 */

/** Metadados de um objeto guardado. */
export interface StoredObject {
  key: string;
  size: number;
  contentType: string;
}

/** Opções de upload genéricas. */
export interface PutObjectInput {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
}

/** Configuração genérica de um cliente de storage. */
export interface StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  forcePathStyle: boolean;
}

/** Contrato de storage (implementado na Fase 5). */
export interface ObjectStorage {
  put(input: PutObjectInput): Promise<StoredObject>;
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}
