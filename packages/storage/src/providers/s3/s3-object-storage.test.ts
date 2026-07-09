import { describe, it, expect, vi, beforeEach } from 'vitest';
import { S3Client } from '@aws-sdk/client-s3';
import { StorageError } from '../../errors';
import type { StorageConfig } from '../../contracts';
import { S3ObjectStorage } from './s3-object-storage';

const sendMock = vi.fn();

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: sendMock })),
  PutObjectCommand: vi.fn().mockImplementation((input) => ({ input })),
  DeleteObjectCommand: vi.fn().mockImplementation((input) => ({ input })),
  GetObjectCommand: vi.fn().mockImplementation((input) => ({ input })),
}));

const getSignedUrlMock = vi.fn();

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => getSignedUrlMock(...args),
}));

const config: StorageConfig = {
  endpoint: 'http://localhost:9000',
  publicEndpoint: 'http://localhost:9000',
  region: 'us-east-1',
  bucket: 'frontcore',
  accessKey: 'test',
  secretKey: 'test',
  forcePathStyle: true,
};

describe('S3ObjectStorage', () => {
  beforeEach(() => {
    sendMock.mockReset();
    getSignedUrlMock.mockReset();
    vi.mocked(S3Client).mockClear();
  });

  describe('put', () => {
    it('envia o objeto e devolve os metadados', async () => {
      sendMock.mockResolvedValue({});
      const storage = new S3ObjectStorage(config);
      const body = Buffer.from('conteudo');

      const result = await storage.put({
        key: 'org-1/file.pdf',
        body,
        contentType: 'application/pdf',
      });

      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        key: 'org-1/file.pdf',
        size: body.byteLength,
        contentType: 'application/pdf',
      });
    });

    it('rejeita key inválida sem chamar o SDK', async () => {
      const storage = new S3ObjectStorage(config);

      await expect(
        storage.put({ key: '', body: Buffer.from('x'), contentType: 'text/plain' }),
      ).rejects.toThrow(StorageError);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('mapeia falhas do SDK para StorageError', async () => {
      sendMock.mockRejectedValue(new Error('network down'));
      const storage = new S3ObjectStorage(config);

      await expect(
        storage.put({ key: 'k', body: Buffer.from('x'), contentType: 'text/plain' }),
      ).rejects.toThrow(StorageError);
    });
  });

  describe('get', () => {
    it('lê o objeto e devolve o conteúdo como Buffer', async () => {
      sendMock.mockResolvedValue({
        Body: { transformToByteArray: () => Promise.resolve(Uint8Array.from([1, 2, 3])) },
      });
      const storage = new S3ObjectStorage(config);

      const result = await storage.get('org-1/file.pdf');

      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result).toEqual(Buffer.from([1, 2, 3]));
    });

    it('rejeita key inválida sem chamar o SDK', async () => {
      const storage = new S3ObjectStorage(config);

      await expect(storage.get('')).rejects.toThrow(StorageError);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('mapeia falhas do SDK para StorageError', async () => {
      sendMock.mockRejectedValue(new Error('network down'));
      const storage = new S3ObjectStorage(config);

      await expect(storage.get('k')).rejects.toThrow(StorageError);
    });
  });

  describe('getDownloadUrl', () => {
    it('devolve o URL assinado', async () => {
      getSignedUrlMock.mockResolvedValue('https://signed.example/k');
      const storage = new S3ObjectStorage(config);

      const url = await storage.getDownloadUrl('org-1/file.pdf', 300);

      expect(url).toBe('https://signed.example/k');
      expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
    });

    it('rejeita key inválida sem chamar o SDK', async () => {
      const storage = new S3ObjectStorage(config);

      await expect(storage.getDownloadUrl('', 60)).rejects.toThrow(StorageError);
      expect(getSignedUrlMock).not.toHaveBeenCalled();
    });

    it('mapeia falhas para StorageError', async () => {
      getSignedUrlMock.mockRejectedValue(new Error('boom'));
      const storage = new S3ObjectStorage(config);

      await expect(storage.getDownloadUrl('k', 60)).rejects.toThrow(StorageError);
    });
  });

  describe('delete', () => {
    it('elimina o objeto', async () => {
      sendMock.mockResolvedValue({});
      const storage = new S3ObjectStorage(config);

      await storage.delete('org-1/file.pdf');

      expect(sendMock).toHaveBeenCalledTimes(1);
    });

    it('mapeia falhas para StorageError', async () => {
      sendMock.mockRejectedValue(new Error('boom'));
      const storage = new S3ObjectStorage(config);

      await expect(storage.delete('k')).rejects.toThrow(StorageError);
    });
  });

  describe('endpoint de assinatura (publicEndpoint)', () => {
    it('constrói um único S3Client quando publicEndpoint é igual a endpoint', () => {
      new S3ObjectStorage(config);

      expect(S3Client).toHaveBeenCalledTimes(1);
    });

    it('constrói um segundo S3Client com o endpoint público quando este difere do interno', () => {
      new S3ObjectStorage({
        ...config,
        endpoint: 'http://minio:9000',
        publicEndpoint: 'http://localhost:9000',
      });

      expect(S3Client).toHaveBeenCalledTimes(2);
      expect(S3Client).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ endpoint: 'http://minio:9000' }),
      );
      expect(S3Client).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ endpoint: 'http://localhost:9000' }),
      );
    });

    it('usa o cliente construído com o endpoint público para assinar o URL de download', async () => {
      getSignedUrlMock.mockResolvedValue('http://localhost:9000/frontcore/k?signed');
      const storage = new S3ObjectStorage({
        ...config,
        endpoint: 'http://minio:9000',
        publicEndpoint: 'http://localhost:9000',
      });
      const signingClientInstance = vi.mocked(S3Client).mock.results[1]?.value;

      await storage.getDownloadUrl('org-1/file.pdf', 300);

      expect(getSignedUrlMock).toHaveBeenCalledWith(
        signingClientInstance,
        expect.anything(),
        { expiresIn: 300 },
      );
    });
  });
});
