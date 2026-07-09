/** O provider está operacional, mas esta extração específica falhou (ex. imagem corrupta). */
export class OCRExtractionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'OCRExtractionError';
  }
}
