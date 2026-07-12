/** O documento PDF é inválido, corrompido, ou não tem páginas. */
export class PdfInvalidError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PdfInvalidError';
  }
}
