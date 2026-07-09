import type { OCRProvider } from '../contracts';
import type { ExtractOptions, OCRInput, OCRResult } from '../types';
import { OCRUnsupportedFormatError } from '../errors';
import { withTimeout } from '../utils';

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Orquestra um `OCRProvider` — o único ponto que o resto da aplicação
 * (ex. o Worker) deve conhecer; nunca a implementação concreta do
 * provider. Aplica dois comportamentos que não fazem sentido duplicar
 * em cada provider: validação de formato suportado e limite de tempo.
 */
export class OCRService {
  constructor(private readonly provider: OCRProvider) {}

  async extract(input: OCRInput, options?: ExtractOptions): Promise<OCRResult> {
    if (!this.provider.supports(input.contentType)) {
      throw new OCRUnsupportedFormatError(
        `O provider "${this.provider.name}" não suporta o formato "${input.contentType}".`,
      );
    }

    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    return withTimeout(
      this.provider.extract(input, options),
      timeoutMs,
      `Extração OCR excedeu ${timeoutMs}ms (provider "${this.provider.name}").`,
    );
  }

  async health(): Promise<boolean> {
    return this.provider.health();
  }
}
