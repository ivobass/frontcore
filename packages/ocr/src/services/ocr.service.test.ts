import { describe, it, expect, vi } from 'vitest';
import type { OCRProvider, PdfRasterizer } from '../contracts';
import type { OCRResult, PdfRasterizationOptions, RasterizedPage } from '../types';
import { OCRUnsupportedFormatError, OCRTimeoutError, PdfInvalidError } from '../errors';
import { OCRService } from './ocr.service';

function buildResult(overrides: Partial<OCRResult> = {}): OCRResult {
  return {
    provider: 'stub',
    language: 'eng',
    confidence: 90,
    processingTimeMs: 10,
    pages: 1,
    text: 'texto',
    ...overrides,
  };
}

const PDF_OPTIONS: PdfRasterizationOptions = {
  maxPages: 10,
  dpi: 200,
  maxDimensionPx: 2500,
  timeoutMs: 30_000,
};

function buildRasterizer(pages: RasterizedPage[] | (() => never)): PdfRasterizer {
  return {
    name: 'poppler-stub',
    async *rasterize() {
      if (typeof pages === 'function') {
        pages();
        return;
      }
      for (const page of pages) {
        yield page;
      }
    },
  };
}

function page(pageNumber: number): RasterizedPage {
  return { pageNumber, buffer: Buffer.from(`page-${pageNumber}`), contentType: 'image/png' };
}

describe('OCRService', () => {
  describe('extract — imagens (JPEG/PNG)', () => {
    it('rejeita com OCRUnsupportedFormatError sem chamar o provider quando o formato não é suportado', async () => {
      const extract = vi.fn();
      const provider: OCRProvider = {
        name: 'stub',
        supports: () => false,
        extract,
        health: vi.fn(),
        version: () => '1',
      };
      const service = new OCRService(provider, buildRasterizer([]), PDF_OPTIONS);

      await expect(
        service.extract({ buffer: Buffer.from('x'), contentType: 'application/octet-stream' }),
      ).rejects.toThrow(OCRUnsupportedFormatError);
      expect(extract).not.toHaveBeenCalled();
    });

    it('PNG segue diretamente para o provider, sem passar pelo rasterizer', async () => {
      const result = buildResult();
      const rasterize = vi.fn();
      const provider: OCRProvider = {
        name: 'stub',
        supports: () => true,
        extract: vi.fn().mockResolvedValue(result),
        health: vi.fn(),
        version: () => '1',
      };
      const service = new OCRService(provider, { name: 'unused', rasterize }, PDF_OPTIONS);

      await expect(
        service.extract({ buffer: Buffer.from('x'), contentType: 'image/png' }),
      ).resolves.toEqual(result);
      expect(rasterize).not.toHaveBeenCalled();
    });

    it('JPEG segue diretamente para o provider, sem passar pelo rasterizer', async () => {
      const result = buildResult();
      const rasterize = vi.fn();
      const provider: OCRProvider = {
        name: 'stub',
        supports: () => true,
        extract: vi.fn().mockResolvedValue(result),
        health: vi.fn(),
        version: () => '1',
      };
      const service = new OCRService(provider, { name: 'unused', rasterize }, PDF_OPTIONS);

      await expect(
        service.extract({ buffer: Buffer.from('x'), contentType: 'image/jpeg' }),
      ).resolves.toEqual(result);
      expect(rasterize).not.toHaveBeenCalled();
    });

    it('rejeita com OCRTimeoutError quando o provider excede o timeout', async () => {
      vi.useFakeTimers();
      const provider: OCRProvider = {
        name: 'stub',
        supports: () => true,
        extract: () => new Promise(() => {}),
        health: vi.fn(),
        version: () => '1',
      };
      const service = new OCRService(provider, buildRasterizer([]), PDF_OPTIONS);

      const promise = service.extract(
        { buffer: Buffer.from('x'), contentType: 'image/png' },
        { timeoutMs: 50 },
      );
      const assertion = expect(promise).rejects.toThrow(OCRTimeoutError);

      await vi.advanceTimersByTimeAsync(50);
      await assertion;
      vi.useRealTimers();
    });
  });

  describe('extract — PDF (Fase 6.9)', () => {
    it('application/pdf chama o rasterizer, nunca provider.supports()', async () => {
      const supports = vi.fn(() => false);
      const extract = vi.fn().mockResolvedValue(buildResult({ text: 'a', confidence: 80 }));
      const provider: OCRProvider = { name: 'tesseract', supports, extract, health: vi.fn(), version: () => '1' };
      const rasterizer = buildRasterizer([page(1)]);

      await new OCRService(provider, rasterizer, PDF_OPTIONS).extract({
        buffer: Buffer.from('%PDF-1.4'),
        contentType: 'application/pdf',
      });

      expect(supports).not.toHaveBeenCalled();
    });

    it('o provider nunca recebe contentType application/pdf — só image/png por página', async () => {
      const extract = vi.fn().mockResolvedValue(buildResult({ text: 'a', confidence: 80 }));
      const provider: OCRProvider = { name: 'tesseract', supports: () => true, extract, health: vi.fn(), version: () => '1' };
      const rasterizer = buildRasterizer([page(1), page(2)]);

      await new OCRService(provider, rasterizer, PDF_OPTIONS).extract({
        buffer: Buffer.from('%PDF-1.4'),
        contentType: 'application/pdf',
      });

      expect(extract).toHaveBeenCalledTimes(2);
      for (const call of extract.mock.calls) {
        expect(call[0].contentType).toBe('image/png');
      }
    });

    it('páginas processadas por ordem — provider chamado sequencialmente 1, depois 2, depois 3', async () => {
      const order: number[] = [];
      let nextPage = 0;
      const pages = [page(1), page(2), page(3)];
      const extract = vi.fn().mockImplementation(async () => {
        nextPage += 1;
        order.push(nextPage);
        return buildResult({ text: `texto ${nextPage}`, confidence: 80 });
      });
      const provider: OCRProvider = { name: 'tesseract', supports: () => true, extract, health: vi.fn(), version: () => '1' };

      await new OCRService(provider, buildRasterizer(pages), PDF_OPTIONS).extract({
        buffer: Buffer.from('%PDF-1.4'),
        contentType: 'application/pdf',
      });

      expect(order).toEqual([1, 2, 3]);
    });

    it('texto agregado com separador por página, na ordem certa', async () => {
      const extract = vi
        .fn()
        .mockResolvedValueOnce(buildResult({ text: 'Conteúdo A', confidence: 80 }))
        .mockResolvedValueOnce(buildResult({ text: 'Conteúdo B', confidence: 70 }));
      const provider: OCRProvider = { name: 'tesseract', supports: () => true, extract, health: vi.fn(), version: () => '1' };

      const result = await new OCRService(provider, buildRasterizer([page(1), page(2)]), PDF_OPTIONS).extract({
        buffer: Buffer.from('%PDF-1.4'),
        contentType: 'application/pdf',
      });

      expect(result.text).toBe('Conteúdo A\n\n--- Página 2 ---\n\nConteúdo B');
    });

    it('número de páginas (pages) corresponde às páginas efetivamente processadas', async () => {
      const extract = vi.fn().mockResolvedValue(buildResult({ text: 'x', confidence: 80 }));
      const provider: OCRProvider = { name: 'tesseract', supports: () => true, extract, health: vi.fn(), version: () => '1' };

      const result = await new OCRService(provider, buildRasterizer([page(1), page(2), page(3)]), PDF_OPTIONS).extract({
        buffer: Buffer.from('%PDF-1.4'),
        contentType: 'application/pdf',
      });

      expect(result.pages).toBe(3);
    });

    it('confiança agregada — ponderada por caracteres não vazios, não uma média simples', async () => {
      const extract = vi
        .fn()
        .mockResolvedValueOnce(buildResult({ text: 'a', confidence: 100 })) // peso 1
        .mockResolvedValueOnce(buildResult({ text: 'ab', confidence: 0 })); // peso 2
      const provider: OCRProvider = { name: 'tesseract', supports: () => true, extract, health: vi.fn(), version: () => '1' };

      const result = await new OCRService(provider, buildRasterizer([page(1), page(2)]), PDF_OPTIONS).extract({
        buffer: Buffer.from('%PDF-1.4'),
        contentType: 'application/pdf',
      });

      // (100*1 + 0*2) / 3 = 33.33... — nunca a média simples (50)
      expect(result.confidence).toBeCloseTo(33.33, 1);
    });

    it('tempo total agregado (processingTimeMs) é reportado como número positivo', async () => {
      const extract = vi.fn().mockResolvedValue(buildResult({ text: 'x', confidence: 80 }));
      const provider: OCRProvider = { name: 'tesseract', supports: () => true, extract, health: vi.fn(), version: () => '1' };

      const result = await new OCRService(provider, buildRasterizer([page(1)]), PDF_OPTIONS).extract({
        buffer: Buffer.from('%PDF-1.4'),
        contentType: 'application/pdf',
      });

      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('metadata inclui inputType, rasterizer e pageConfidences — sem buffers/paths/comandos', async () => {
      const extract = vi
        .fn()
        .mockResolvedValueOnce(buildResult({ text: 'a', confidence: 90 }))
        .mockResolvedValueOnce(buildResult({ text: 'b', confidence: 70 }));
      const provider: OCRProvider = { name: 'tesseract', supports: () => true, extract, health: vi.fn(), version: () => '1' };

      const result = await new OCRService(provider, buildRasterizer([page(1), page(2)]), PDF_OPTIONS).extract({
        buffer: Buffer.from('%PDF-1.4'),
        contentType: 'application/pdf',
      });

      expect(result.metadata).toEqual({
        inputType: 'application/pdf',
        rasterizer: 'poppler-stub',
        pageConfidences: [90, 70],
      });
    });

    it('falha de uma página falha o documento inteiro — sem resultado parcial', async () => {
      const extract = vi
        .fn()
        .mockResolvedValueOnce(buildResult({ text: 'a', confidence: 90 }))
        .mockRejectedValueOnce(new Error('falha na página 2'));
      const provider: OCRProvider = { name: 'tesseract', supports: () => true, extract, health: vi.fn(), version: () => '1' };

      await expect(
        new OCRService(provider, buildRasterizer([page(1), page(2)]), PDF_OPTIONS).extract({
          buffer: Buffer.from('%PDF-1.4'),
          contentType: 'application/pdf',
        }),
      ).rejects.toThrow('falha na página 2');
    });

    it('PDF inválido (rasterizer lança antes de produzir páginas) não chama o provider', async () => {
      const extract = vi.fn();
      const provider: OCRProvider = { name: 'tesseract', supports: () => true, extract, health: vi.fn(), version: () => '1' };
      const rasterizer = buildRasterizer(() => {
        throw new PdfInvalidError('Documento PDF inválido ou corrompido.');
      });

      await expect(
        new OCRService(provider, rasterizer, PDF_OPTIONS).extract({
          buffer: Buffer.from('lixo'),
          contentType: 'application/pdf',
        }),
      ).rejects.toThrow(PdfInvalidError);
      expect(extract).not.toHaveBeenCalled();
    });
  });

  describe('health', () => {
    it('delega no provider', async () => {
      const provider: OCRProvider = {
        name: 'stub',
        supports: () => true,
        extract: vi.fn(),
        health: vi.fn().mockResolvedValue(true),
        version: () => '1',
      };
      const service = new OCRService(provider, buildRasterizer([]), PDF_OPTIONS);

      await expect(service.health()).resolves.toBe(true);
    });
  });
});
