/** Falha operacional do rasterizer (ex. binário em falta, saída inesperada) — não um problema do documento em si. */
export class PdfRasterizerError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PdfRasterizerError';
  }
}
