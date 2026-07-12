import type { PdfRasterizationOptions, RasterizedPage } from '../types';

/**
 * Contrato de pré-processamento PDF → imagem, genérico e sem
 * conhecimento de OCR/domínio — mesma filosofia de `OCRProvider`.
 * `OCRService` é o único consumidor; nenhum provider OCR concreto
 * conhece este contrato.
 *
 * `AsyncIterable`, não `Promise<RasterizedPage[]>`: o consumidor
 * (`OCRService`) processa uma página de cada vez com `for await`, sem
 * nunca ter todas as páginas rasterizadas em memória simultaneamente —
 * ver `docs/phases/phase-6.9-pdf-rasterization-foundation.md` para a
 * comparação com a alternativa por callback.
 */
export interface PdfRasterizer {
  /** Nome do rasterizer (ex. "poppler") — usado em `OCRResult.metadata` e nos logs. */
  readonly name: string;

  /**
   * Rasteriza `pdf` página a página, pela ordem do documento. Lança
   * antes de produzir a primeira página se o documento for inválido,
   * protegido, ou exceder `options.maxPages`.
   */
  rasterize(pdf: Buffer, options: PdfRasterizationOptions): AsyncIterable<RasterizedPage>;
}
