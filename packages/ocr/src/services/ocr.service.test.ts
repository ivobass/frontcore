import { describe, it, expect, vi } from 'vitest';
import type { OCRProvider } from '../contracts';
import type { OCRResult } from '../types';
import { OCRUnsupportedFormatError, OCRTimeoutError } from '../errors';
import { OCRService } from './ocr.service';

function buildResult(overrides: Partial<OCRResult> = {}): OCRResult {
  return {
    provider: 'stub',
    language: 'eng',
    confidence: 90,
    processingTimeMs: 10,
    pages: 1,
    text: 'texto',
    ...overrides,
  };
}

describe('OCRService', () => {
  describe('extract', () => {
    it('rejeita com OCRUnsupportedFormatError sem chamar o provider quando o formato não é suportado', async () => {
      const extract = vi.fn();
      const provider: OCRProvider = {
        name: 'stub',
        supports: () => false,
        extract,
        health: vi.fn(),
        version: () => '1',
      };
      const service = new OCRService(provider);

      await expect(
        service.extract({ buffer: Buffer.from('x'), contentType: 'application/pdf' }),
      ).rejects.toThrow(OCRUnsupportedFormatError);
      expect(extract).not.toHaveBeenCalled();
    });

    it('delega no provider e devolve o OCRResult quando o formato é suportado', async () => {
      const result = buildResult();
      const provider: OCRProvider = {
        name: 'stub',
        supports: () => true,
        extract: vi.fn().mockResolvedValue(result),
        health: vi.fn(),
        version: () => '1',
      };
      const service = new OCRService(provider);

      await expect(
        service.extract({ buffer: Buffer.from('x'), contentType: 'image/png' }),
      ).resolves.toEqual(result);
    });

    it('rejeita com OCRTimeoutError quando o provider excede o timeout', async () => {
      vi.useFakeTimers();
      const provider: OCRProvider = {
        name: 'stub',
        supports: () => true,
        extract: () => new Promise(() => {}),
        health: vi.fn(),
        version: () => '1',
      };
      const service = new OCRService(provider);

      const promise = service.extract(
        { buffer: Buffer.from('x'), contentType: 'image/png' },
        { timeoutMs: 50 },
      );
      const assertion = expect(promise).rejects.toThrow(OCRTimeoutError);

      await vi.advanceTimersByTimeAsync(50);
      await assertion;
      vi.useRealTimers();
    });
  });

  describe('health', () => {
    it('delega no provider', async () => {
      const provider: OCRProvider = {
        name: 'stub',
        supports: () => true,
        extract: vi.fn(),
        health: vi.fn().mockResolvedValue(true),
        version: () => '1',
      };
      const service = new OCRService(provider);

      await expect(service.health()).resolves.toBe(true);
    });
  });
});
