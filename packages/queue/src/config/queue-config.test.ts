import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadQueueConfig } from './queue-config';

describe('loadQueueConfig', () => {
  const original = process.env.REDIS_URL;

  beforeEach(() => {
    process.env.REDIS_URL = 'redis://localhost:6379';
  });

  afterEach(() => {
    if (original === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = original;
  });

  it('lê REDIS_URL do ambiente', () => {
    expect(loadQueueConfig()).toEqual({ redisUrl: 'redis://localhost:6379' });
  });

  it('lança quando REDIS_URL está em falta', () => {
    delete process.env.REDIS_URL;
    expect(() => loadQueueConfig()).toThrow();
  });
});
