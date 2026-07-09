/** O provider em si está indisponível/mal configurado (ex. motor não arranca). */
export class OCRProviderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'OCRProviderError';
  }
}
