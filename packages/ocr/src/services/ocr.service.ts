import type { OCRProvider, PdfRasterizer } from '../contracts';
import type { ExtractOptions, OCRInput, OCRResult, PdfRasterizationOptions } from '../types';
import { OCRUnsupportedFormatError } from '../errors';
import { aggregatePdfConfidence, aggregatePdfText, withTimeout } from '../utils';
import type { PdfPageOcrResult } from '../utils';

const DEFAULT_TIMEOUT_MS = 30_000;

const PDF_CONTENT_TYPE = 'application/pdf';

/**
 * Orquestra um `OCRProvider` — o único ponto que o resto da aplicação
 * (ex. o Worker) deve conhecer; nunca a implementação concreta do
 * provider. Aplica dois comportamentos que não fazem sentido duplicar
 * em cada provider: validação de formato suportado e limite de tempo.
 *
 * Desde a Fase 6.9, também orquestra `PdfRasterizer`: `application/pdf`
 * nunca chega ao `provider.supports()`/`provider.extract()` como PDF —
 * é sempre rasterizado primeiro, página a página, e cada página passa
 * pelo provider como `image/png`. `TesseractProvider` continua a
 * declarar suporte só a `image/jpeg`/`image/png` — o PDF é reconhecido
 * e tratado inteiramente aqui, nunca no provider.
 */
export class OCRService {
  constructor(
    private readonly provider: OCRProvider,
    private readonly pdfRasterizer: PdfRasterizer,
    private readonly pdfOptions: PdfRasterizationOptions,
  ) {}

  async extract(input: OCRInput, options?: ExtractOptions): Promise<OCRResult> {
    if (input.contentType === PDF_CONTENT_TYPE) {
      return this.extractFromPdf(input, options);
    }

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

  /**
   * PDF multipágina: rasteriza e extrai página a página, sequencialmente
   * — nunca mais do que um worker Tesseract ativo de cada vez, sem
   * paralelismo (fora do âmbito da Fase 6.9). Se uma página falhar, o
   * documento inteiro falha — nunca persiste texto parcial nem agrega
   * um resultado incompleto; o erro da página propaga tal e qual para
   * quem chamou `extract()`.
   */
  private async extractFromPdf(input: OCRInput, options?: ExtractOptions): Promise<OCRResult> {
    const startedAt = Date.now();
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const pageResults: PdfPageOcrResult[] = [];
    let resolvedLanguage: string | null = null;

    for await (const page of this.pdfRasterizer.rasterize(input.buffer, this.pdfOptions)) {
      const pageOcr = await withTimeout(
        this.provider.extract(
          { buffer: page.buffer, contentType: page.contentType, filename: input.filename },
          options,
        ),
        timeoutMs,
        `Extração OCR excedeu ${timeoutMs}ms (página ${page.pageNumber}, provider "${this.provider.name}").`,
      );

      resolvedLanguage ??= pageOcr.language;
      pageResults.push({
        pageNumber: page.pageNumber,
        text: pageOcr.text,
        confidence: pageOcr.confidence,
      });
    }

    return {
      provider: this.provider.name,
      language: resolvedLanguage ?? options?.language ?? 'eng',
      confidence: aggregatePdfConfidence(pageResults),
      processingTimeMs: Date.now() - startedAt,
      pages: pageResults.length,
      text: aggregatePdfText(pageResults),
      metadata: {
        inputType: PDF_CONTENT_TYPE,
        rasterizer: this.pdfRasterizer.name,
        pageConfidences: pageResults.map((page) => page.confidence),
      },
    };
  }
}
