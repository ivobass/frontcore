/** O documento PDF tem mais páginas do que `PdfRasterizationOptions.maxPages`. */
export class PdfPageLimitExceededError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PdfPageLimitExceededError';
  }
}
