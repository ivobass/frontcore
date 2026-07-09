import { optionalEnv } from '@frontcore/config';

/** Configuração genérica de seleção/comportamento do pipeline de OCR. */
export interface OcrConfig {
  /** Nome do provider a usar (ex. "tesseract") — ver `createOcrProvider()`. */
  provider: string;
  language: string;
  timeoutMs: number;
}

const DEFAULT_LANGUAGE = 'eng';
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Lê a configuração de OCR a partir do ambiente. Segue a convenção
 * `load<X>Config()` documentada em `docs/CODING_STANDARDS.md`.
 */
export function loadOcrConfig(): OcrConfig {
  return {
    provider: optionalEnv('OCR_PROVIDER', 'tesseract'),
    language: optionalEnv('OCR_LANGUAGE', DEFAULT_LANGUAGE),
    timeoutMs: Number(optionalEnv('OCR_TIMEOUT_MS', String(DEFAULT_TIMEOUT_MS))),
  };
}
