import { optionalEnv } from '@frontcore/config';

/** Configuração genérica de seleção/comportamento do pipeline de OCR. */
export interface OcrConfig {
  /** Nome do provider a usar (ex. "tesseract") — ver `createOcrProvider()`. */
  provider: string;
  language: string;
  timeoutMs: number;
  /** Máximo de páginas de um PDF processadas — acima disto, `PdfPageLimitExceededError` antes de rasterizar. */
  pdfMaxPages: number;
  /** DPI pedido à rasterização — reduzido automaticamente (nunca aumentado) se exceder `pdfMaxDimensionPx`. */
  pdfDpi: number;
  /** Maior dimensão (px) aceite por página rasterizada — nunca amplia páginas pequenas, só limita as grandes. */
  pdfMaxDimensionPx: number;
  /** Timeout aplicado a cada chamada a `pdfinfo`/`pdftoppm` (Fase 6.9). */
  pdfRasterTimeoutMs: number;
}

const DEFAULT_LANGUAGE = 'eng';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_PDF_MAX_PAGES = 10;
const DEFAULT_PDF_DPI = 200;
const DEFAULT_PDF_MAX_DIMENSION_PX = 2500;
const DEFAULT_PDF_RASTER_TIMEOUT_MS = 30_000;

/**
 * Lê e valida uma variável numérica opcional — só validação mínima
 * (finito, positivo), não um sistema genérico de schemas. Erro claro em
 * vez de `NaN`/valor negativo silenciosos a propagar para `pdftoppm`.
 */
function parsePositiveNumberEnv(name: string, fallback: number): number {
  const raw = optionalEnv(name, String(fallback));
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Configuração inválida: ${name}="${raw}" tem de ser um número positivo.`);
  }
  return value;
}

/**
 * Lê a configuração de OCR a partir do ambiente. Segue a convenção
 * `load<X>Config()` documentada em `docs/CODING_STANDARDS.md`.
 */
export function loadOcrConfig(): OcrConfig {
  return {
    provider: optionalEnv('OCR_PROVIDER', 'tesseract'),
    language: optionalEnv('OCR_LANGUAGE', DEFAULT_LANGUAGE),
    timeoutMs: Number(optionalEnv('OCR_TIMEOUT_MS', String(DEFAULT_TIMEOUT_MS))),
    pdfMaxPages: parsePositiveNumberEnv('OCR_PDF_MAX_PAGES', DEFAULT_PDF_MAX_PAGES),
    pdfDpi: parsePositiveNumberEnv('OCR_PDF_DPI', DEFAULT_PDF_DPI),
    pdfMaxDimensionPx: parsePositiveNumberEnv('OCR_PDF_MAX_DIMENSION_PX', DEFAULT_PDF_MAX_DIMENSION_PX),
    pdfRasterTimeoutMs: parsePositiveNumberEnv('OCR_PDF_RASTER_TIMEOUT_MS', DEFAULT_PDF_RASTER_TIMEOUT_MS),
  };
}
