import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OCRExtractionError, OCRProviderError } from '../../errors';
import { TesseractProvider } from './tesseract-provider';

const createWorkerMock = vi.fn();
const recognizeMock = vi.fn();
const terminateMock = vi.fn();

vi.mock('tesseract.js', () => ({
  default: {
    createWorker: (...args: unknown[]) => createWorkerMock(...args),
  },
}));

describe('TesseractProvider', () => {
  beforeEach(() => {
    createWorkerMock.mockReset();
    recognizeMock.mockReset();
    terminateMock.mockReset();
    createWorkerMock.mockResolvedValue({ recognize: recognizeMock, terminate: terminateMock });
    terminateMock.mockResolvedValue(undefined);
  });

  describe('supports', () => {
    it('suporta image/jpeg e image/png', () => {
      const provider = new TesseractProvider();
      expect(provider.supports('image/jpeg')).toBe(true);
      expect(provider.supports('image/png')).toBe(true);
    });

    it('não suporta application/pdf nesta fase', () => {
      const provider = new TesseractProvider();
      expect(provider.supports('application/pdf')).toBe(false);
    });
  });

  describe('version/name', () => {
    it('devolve nome e versão', () => {
      const provider = new TesseractProvider();
      expect(provider.name).toBe('tesseract');
      expect(provider.version()).toBeTruthy();
    });
  });

  describe('extract', () => {
    it('devolve um OCRResult normalizado a partir do resultado do Tesseract', async () => {
      recognizeMock.mockResolvedValue({ data: { text: 'texto extraído', confidence: 92.5 } });
      const provider = new TesseractProvider();

      const result = await provider.extract({
        buffer: Buffer.from('fake-image'),
        contentType: 'image/png',
        filename: 'fatura.png',
      });

      expect(result).toEqual({
        provider: 'tesseract',
        language: 'eng',
        confidence: 92.5,
        processingTimeMs: expect.any(Number),
        pages: 1,
        text: 'texto extraído',
      });
      expect(createWorkerMock).toHaveBeenCalledWith('eng');
      expect(terminateMock).toHaveBeenCalledTimes(1);
    });

    it('usa a língua passada em options', async () => {
      recognizeMock.mockResolvedValue({ data: { text: '', confidence: 0 } });
      const provider = new TesseractProvider();

      await provider.extract(
        { buffer: Buffer.from('x'), contentType: 'image/jpeg' },
        { language: 'por' },
      );

      expect(createWorkerMock).toHaveBeenCalledWith('por');
    });

    it('mapeia falha ao iniciar o worker para OCRProviderError', async () => {
      createWorkerMock.mockRejectedValue(new Error('não foi possível iniciar'));
      const provider = new TesseractProvider();

      await expect(
        provider.extract({ buffer: Buffer.from('x'), contentType: 'image/png' }),
      ).rejects.toThrow(OCRProviderError);
    });

    it('mapeia falha em recognize() para OCRExtractionError e mesmo assim termina o worker', async () => {
      recognizeMock.mockRejectedValue(new Error('imagem corrompida'));
      const provider = new TesseractProvider();

      await expect(
        provider.extract({ buffer: Buffer.from('x'), contentType: 'image/png' }),
      ).rejects.toThrow(OCRExtractionError);
      expect(terminateMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('health', () => {
    it('devolve true quando o worker arranca e termina sem erro', async () => {
      const provider = new TesseractProvider();
      await expect(provider.health()).resolves.toBe(true);
    });

    it('devolve false quando o worker falha ao arrancar', async () => {
      createWorkerMock.mockRejectedValue(new Error('sem memória'));
      const provider = new TesseractProvider();
      await expect(provider.health()).resolves.toBe(false);
    });
  });
});
