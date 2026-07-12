/** Uma página rasterizada de um PDF — sempre PNG, nunca outro formato intermédio. */
export interface RasterizedPage {
  pageNumber: number;
  buffer: Buffer;
  contentType: 'image/png';
}

/**
 * Limites explícitos aplicados a qualquer rasterização — nenhum tem
 * omissão implícita dentro do rasterizer; todos vêm de
 * `OcrConfig`/`loadOcrConfig()`.
 */
export interface PdfRasterizationOptions {
  maxPages: number;
  dpi: number;
  maxDimensionPx: number;
  timeoutMs: number;
}
