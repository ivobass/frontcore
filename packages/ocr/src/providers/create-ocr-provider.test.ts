import { describe, it, expect } from 'vitest';
import type { OcrConfig } from '../contracts';
import { OCRProviderError } from '../errors';
import { TesseractProvider } from './tesseract';
import { createOcrProvider } from './create-ocr-provider';

function buildConfig(overrides: Partial<OcrConfig> = {}): OcrConfig {
  return {
    provider: 'tesseract',
    language: 'eng',
    timeoutMs: 30_000,
    pdfMaxPages: 10,
    pdfDpi: 200,
    pdfMaxDimensionPx: 2500,
    pdfRasterTimeoutMs: 30_000,
    ...overrides,
  };
}

describe('createOcrProvider', () => {
  it('devolve TesseractProvider para provider "tesseract"', () => {
    const provider = createOcrProvider(buildConfig());
    expect(provider).toBeInstanceOf(TesseractProvider);
  });

  it('lança OCRProviderError para um provider desconhecido', () => {
    expect(() => createOcrProvider(buildConfig({ provider: 'paddle' }))).toThrow(OCRProviderError);
  });
});
