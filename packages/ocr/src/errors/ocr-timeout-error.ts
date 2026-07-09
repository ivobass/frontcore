/** A extração excedeu o limite de tempo configurado. */
export class OCRTimeoutError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'OCRTimeoutError';
  }
}
