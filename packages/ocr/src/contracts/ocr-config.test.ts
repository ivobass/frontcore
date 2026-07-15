import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadOcrConfig } from './ocr-config';

const ENV_KEYS = [
  'OCR_PROVIDER',
  'OCR_LANGUAGE',
  'OCR_TIMEOUT_MS',
  'OCR_PDF_MAX_PAGES',
  'OCR_PDF_DPI',
  'OCR_PDF_MAX_DIMENSION_PX',
  'OCR_PDF_RASTER_TIMEOUT_MS',
] as const;

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

  it('usa valores por omissão quando nada está definido — "por" (mercado português, ver ocr-config.ts)', () => {
    expect(loadOcrConfig()).toEqual({
      provider: 'tesseract',
      language: 'por',
      timeoutMs: 30_000,
      pdfMaxPages: 10,
      pdfDpi: 200,
      pdfMaxDimensionPx: 2500,
      pdfRasterTimeoutMs: 30_000,
    });
  });

  it('lê OCR_PROVIDER/OCR_LANGUAGE/OCR_TIMEOUT_MS quando definidos', () => {
    process.env.OCR_PROVIDER = 'paddle';
    process.env.OCR_LANGUAGE = 'eng';
    process.env.OCR_TIMEOUT_MS = '5000';

    const config = loadOcrConfig();
    expect(config.provider).toBe('paddle');
    expect(config.language).toBe('eng');
    expect(config.timeoutMs).toBe(5000);
  });

  it('lê overrides válidos das 4 variáveis novas de PDF (Fase 6.9)', () => {
    process.env.OCR_PDF_MAX_PAGES = '5';
    process.env.OCR_PDF_DPI = '150';
    process.env.OCR_PDF_MAX_DIMENSION_PX = '1800';
    process.env.OCR_PDF_RASTER_TIMEOUT_MS = '15000';

    expect(loadOcrConfig()).toEqual({
      provider: 'tesseract',
      language: 'por',
      timeoutMs: 30_000,
      pdfMaxPages: 5,
      pdfDpi: 150,
      pdfMaxDimensionPx: 1800,
      pdfRasterTimeoutMs: 15_000,
    });
  });

  it.each(['OCR_PDF_MAX_PAGES', 'OCR_PDF_DPI', 'OCR_PDF_MAX_DIMENSION_PX', 'OCR_PDF_RASTER_TIMEOUT_MS'])(
    '%s: lança para valor não numérico',
    (key) => {
      process.env[key] = 'abc';
      expect(() => loadOcrConfig()).toThrow(/Configuração inválida/);
    },
  );

  it.each(['OCR_PDF_MAX_PAGES', 'OCR_PDF_DPI', 'OCR_PDF_MAX_DIMENSION_PX', 'OCR_PDF_RASTER_TIMEOUT_MS'])(
    '%s: lança para valor zero ou negativo',
    (key) => {
      process.env[key] = '0';
      expect(() => loadOcrConfig()).toThrow(/Configuração inválida/);

      process.env[key] = '-10';
      expect(() => loadOcrConfig()).toThrow(/Configuração inválida/);
    },
  );

  it.each(['OCR_PDF_MAX_PAGES', 'OCR_PDF_DPI', 'OCR_PDF_MAX_DIMENSION_PX', 'OCR_PDF_RASTER_TIMEOUT_MS'])(
    '%s: lança para Infinity',
    (key) => {
      process.env[key] = 'Infinity';
      expect(() => loadOcrConfig()).toThrow(/Configuração inválida/);
    },
  );
});
