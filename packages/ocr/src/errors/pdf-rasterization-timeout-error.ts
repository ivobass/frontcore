/** O processo de rasterização (inspeção ou conversão de página) excedeu `timeoutMs`. */
export class PdfRasterizationTimeoutError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PdfRasterizationTimeoutError';
  }
}
