/** O documento PDF está protegido por password — nunca aceite, nunca contornado. */
export class PdfProtectedError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PdfProtectedError';
  }
}
