import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadOcrConfig } from './ocr-config';

const ENV_KEYS = ['OCR_PROVIDER', 'OCR_LANGUAGE', 'OCR_TIMEOUT_MS'] as const;

describe('loadOcrConfig', () => {
  const original: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      original[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  it('usa valores por omissão quando nada está definido', () => {
    expect(loadOcrConfig()).toEqual({
      provider: 'tesseract',
      language: 'eng',
      timeoutMs: 30_000,
    });
  });

  it('lê OCR_PROVIDER/OCR_LANGUAGE/OCR_TIMEOUT_MS quando definidos', () => {
    process.env.OCR_PROVIDER = 'paddle';
    process.env.OCR_LANGUAGE = 'por';
    process.env.OCR_TIMEOUT_MS = '5000';

    expect(loadOcrConfig()).toEqual({
      provider: 'paddle',
      language: 'por',
      timeoutMs: 5000,
    });
  });
});
