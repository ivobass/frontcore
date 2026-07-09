/** O provider selecionado não processa o content-type indicado. */
export class OCRUnsupportedFormatError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'OCRUnsupportedFormatError';
  }
}
