import type { ExtractOptions, OCRInput, OCRResult } from '../types';

/**
 * Contrato de um motor de OCR — genérico, sem conhecimento de faturas,
 * IA ou parsing. Qualquer provider concreto (Tesseract, PaddleOCR,
 * Azure Vision, Google Vision, AWS Textract, ...) implementa isto;
 * consumidores dependem só deste contrato, nunca de uma implementação
 * concreta.
 */
export interface OCRProvider {
  /** Nome do provider (ex. "tesseract") — usado em `OCRResult.provider` e nos logs. */
  readonly name: string;

  /** Extrai texto de `input`. Lança `OCRProviderError`/`OCRExtractionError` em falha. */
  extract(input: OCRInput, options?: ExtractOptions): Promise<OCRResult>;

  /** Confirma que o provider está operacional (ex. motor consegue arrancar). */
  health(): Promise<boolean>;

  /** Indica se este provider processa o content-type indicado. */
  supports(contentType: string): boolean;

  /** Versão do provider/motor subjacente. */
  version(): string;
}
