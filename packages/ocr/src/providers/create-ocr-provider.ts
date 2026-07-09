import type { OcrConfig, OCRProvider } from '../contracts';
import { OCRProviderError } from '../errors';
import { TesseractProvider } from './tesseract';

/**
 * Seleciona o provider concreto a partir de `OcrConfig.provider`
 * (`OCR_PROVIDER`). Adicionar um motor novo (PaddleOCR, Azure Vision,
 * Google Vision, AWS Textract, ...) é acrescentar um `case` aqui —
 * nada em `apps/frontrest/workers` muda.
 */
export function createOcrProvider(config: OcrConfig): OCRProvider {
  switch (config.provider) {
    case 'tesseract':
      return new TesseractProvider();
    default:
      throw new OCRProviderError(`Provider OCR desconhecido: "${config.provider}".`);
  }
}
