import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadStorageConfig } from './storage-config';

const ENV_KEYS = [
  'S3_ENDPOINT',
  'S3_PUBLIC_ENDPOINT',
  'S3_REGION',
  'S3_BUCKET',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
  'S3_FORCE_PATH_STYLE',
] as const;

describe('loadStorageConfig', () => {
  const original: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) original[key] = process.env[key];
    process.env.S3_ENDPOINT = 'http://localhost:9000';
    process.env.S3_REGION = 'us-east-1';
    process.env.S3_BUCKET = 'frontcore';
    process.env.S3_ACCESS_KEY = 'test-access';
    process.env.S3_SECRET_KEY = 'test-secret';
    delete process.env.S3_FORCE_PATH_STYLE;
    delete process.env.S3_PUBLIC_ENDPOINT;
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  it('lê a configuração a partir do ambiente, com forcePathStyle a assumir true por omissão', () => {
    const config = loadStorageConfig();
    expect(config).toEqual({
      endpoint: 'http://localhost:9000',
      publicEndpoint: 'http://localhost:9000',
      region: 'us-east-1',
      bucket: 'frontcore',
      accessKey: 'test-access',
      secretKey: 'test-secret',
      forcePathStyle: true,
    });
  });

  it('lança quando falta uma variável obrigatória', () => {
    delete process.env.S3_BUCKET;
    expect(() => loadStorageConfig()).toThrow();
  });

  it('forcePathStyle é false quando explicitamente "false"', () => {
    process.env.S3_FORCE_PATH_STYLE = 'false';
    expect(loadStorageConfig().forcePathStyle).toBe(false);
  });

  it('publicEndpoint assume o valor de S3_ENDPOINT quando S3_PUBLIC_ENDPOINT não está definido', () => {
    expect(loadStorageConfig().publicEndpoint).toBe('http://localhost:9000');
  });

  it('publicEndpoint usa S3_PUBLIC_ENDPOINT quando definido, sem alterar endpoint', () => {
    process.env.S3_ENDPOINT = 'http://minio:9000';
    process.env.S3_PUBLIC_ENDPOINT = 'http://localhost:9000';
    const config = loadStorageConfig();
    expect(config.endpoint).toBe('http://minio:9000');
    expect(config.publicEndpoint).toBe('http://localhost:9000');
  });
});
