import { describe, it, expect } from 'vitest';
import { OCRProviderError } from '../errors';
import { TesseractProvider } from './tesseract';
import { createOcrProvider } from './create-ocr-provider';

describe('createOcrProvider', () => {
  it('devolve TesseractProvider para provider "tesseract"', () => {
    const provider = createOcrProvider({ provider: 'tesseract', language: 'eng', timeoutMs: 30_000 });
    expect(provider).toBeInstanceOf(TesseractProvider);
  });

  it('lança OCRProviderError para um provider desconhecido', () => {
    expect(() =>
      createOcrProvider({ provider: 'paddle', language: 'eng', timeoutMs: 30_000 }),
    ).toThrow(OCRProviderError);
  });
});
