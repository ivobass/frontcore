import Tesseract from 'tesseract.js';
import type { OCRProvider } from '../../contracts';
import type { ExtractOptions, OCRInput, OCRResult } from '../../types';
import { OCRExtractionError, OCRProviderError } from '../../errors';

/**
 * `tesseract.js` — WASM puro, sem dependência de sistema (ao contrário
 * do binário nativo `tesseract-ocr`), por isso "implementação simples"
 * (Fase 6.2) não exige nada extra na imagem Docker. Só imagens
 * rasterizadas — `application/pdf` fica de fora nesta fase porque
 * requer renderização de PDF para imagem primeiro, explicitamente fora
 * do âmbito ("PDF rendering avançado").
 */
const SUPPORTED_CONTENT_TYPES = ['image/jpeg', 'image/png'];

const TESSERACT_VERSION = '5'; // versão do motor Tesseract usada pelo tesseract.js@7.

export class TesseractProvider implements OCRProvider {
  readonly name = 'tesseract';

  supports(contentType: string): boolean {
    return SUPPORTED_CONTENT_TYPES.includes(contentType);
  }

  version(): string {
    return TESSERACT_VERSION;
  }

  async health(): Promise<boolean> {
    try {
      const worker = await Tesseract.createWorker('eng');
      await worker.terminate();
      return true;
    } catch {
      return false;
    }
  }

  async extract(input: OCRInput, options?: ExtractOptions): Promise<OCRResult> {
    const language = options?.language ?? 'eng';
    const startedAt = Date.now();

    let worker: Tesseract.Worker;
    try {
      worker = await Tesseract.createWorker(language);
    } catch (error) {
      throw new OCRProviderError('Falha ao iniciar o provider Tesseract.', { cause: error });
    }

    try {
      const { data } = await worker.recognize(input.buffer);
      return {
        provider: this.name,
        language,
        confidence: data.confidence,
        processingTimeMs: Date.now() - startedAt,
        // tesseract.js processa uma imagem de cada vez nesta fase — sem
        // suporte a TIFF multi-página ("sem otimizações").
        pages: 1,
        text: data.text,
      };
    } catch (error) {
      throw new OCRExtractionError(
        `Falha ao extrair texto de "${input.filename ?? 'ficheiro'}".`,
        { cause: error },
      );
    } finally {
      await worker.terminate();
    }
  }
}
