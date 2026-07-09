/** Metadados de um objeto guardado. */
export interface StoredObject {
  key: string;
  size: number;
  contentType: string;
}

/** Opções de upload direto pelo servidor. */
export interface PutObjectInput {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
}

/** Configuração genérica de um cliente de storage (S3-compatível). */
export interface StorageConfig {
  /** Endpoint usado para operações servidor → storage (put/get/delete). */
  endpoint: string;
  /**
   * Endpoint embutido nos URLs assinados devolvidos a clientes externos
   * (browser). Distinto de `endpoint` sempre que o servidor e o cliente
   * externo resolvem o storage por caminhos de rede diferentes (ex.:
   * `endpoint` interno de uma rede Docker vs. porta publicada no host).
   * Resolvido em `loadStorageConfig()` — assume o valor de `endpoint`
   * quando não há um endpoint público distinto configurado.
   */
  publicEndpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  forcePathStyle: boolean;
}

/**
 * Contrato de storage de objetos (S3-compatível), reutilizável por
 * qualquer produto FrontCore.
 *
 * `getUploadUrl` (URL assinado para upload direto do browser, sem passar
 * pelo servidor) fica preparado como a extensão natural deste contrato
 * quando existir um consumidor real — não implementado nesta fase, ver
 * `docs/phases/phase-5.1-upload-storage-foundation.md`.
 */
export interface ObjectStorage {
  put(input: PutObjectInput): Promise<StoredObject>;
  getDownloadUrl(key: string, expiresInSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}
