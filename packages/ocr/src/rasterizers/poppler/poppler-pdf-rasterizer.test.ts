import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PdfRasterizationOptions } from '../../types';
import {
  PdfInvalidError,
  PdfProtectedError,
  PdfPageLimitExceededError,
  PdfRasterizationTimeoutError,
  PdfRasterizerError,
} from '../../errors';
import { PopplerPdfRasterizer } from './poppler-pdf-rasterizer';

const execFileMock = vi.fn();
const mkdtempMock = vi.fn();
const writeFileMock = vi.fn();
const readFileMock = vi.fn();
const unlinkMock = vi.fn();
const rmMock = vi.fn();

vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => (execFileMock as (...a: unknown[]) => void)(...args),
}));

vi.mock('node:fs/promises', () => ({
  mkdtemp: (...args: unknown[]) => mkdtempMock(...args),
  writeFile: (...args: unknown[]) => writeFileMock(...args),
  readFile: (...args: unknown[]) => readFileMock(...args),
  unlink: (...args: unknown[]) => unlinkMock(...args),
  rm: (...args: unknown[]) => rmMock(...args),
}));

const OPTIONS: PdfRasterizationOptions = {
  maxPages: 10,
  dpi: 200,
  maxDimensionPx: 2500,
  timeoutMs: 30_000,
};

const TEMP_DIR = '/tmp/frontcore-ocr-pdf-test';

function pdfinfoStdout(pageCount: number, widthPts = 800, heightPts = 400): string {
  return `Pages:           ${pageCount}\nPage size:       ${widthPts} x ${heightPts} pts\n`;
}

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;

async function drain<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
}

describe('PopplerPdfRasterizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mkdtempMock.mockResolvedValue(TEMP_DIR);
    writeFileMock.mockResolvedValue(undefined);
    unlinkMock.mockResolvedValue(undefined);
    rmMock.mockResolvedValue(undefined);
    readFileMock.mockResolvedValue(Buffer.from('png-bytes'));
  });

  it('PDF de uma página: devolve exatamente 1 página com o buffer lido', async () => {
    execFileMock.mockImplementation((command: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
      cb(null, command === 'pdfinfo' ? pdfinfoStdout(1) : '', '');
    });

    const pages = await drain(new PopplerPdfRasterizer().rasterize(Buffer.from('%PDF-1.4'), OPTIONS));

    expect(pages).toEqual([{ pageNumber: 1, buffer: Buffer.from('png-bytes'), contentType: 'image/png' }]);
  });

  it('PDF multipágina: devolve o número certo de páginas, numeradas pela ordem certa', async () => {
    execFileMock.mockImplementation((command: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
      cb(null, command === 'pdfinfo' ? pdfinfoStdout(3) : '', '');
    });

    const pages = await drain(new PopplerPdfRasterizer().rasterize(Buffer.from('%PDF-1.4'), OPTIONS));

    expect(pages.map((p) => p.pageNumber)).toEqual([1, 2, 3]);
  });

  it('ordem das páginas: pdftoppm é chamado com -f/-l na sequência 1, 2, 3 — nunca fora de ordem', async () => {
    const pdftoppmCalls: string[] = [];
    execFileMock.mockImplementation((command: string, args: string[], _opts: unknown, cb: ExecFileCallback) => {
      if (command === 'pdftoppm') pdftoppmCalls.push(args[args.indexOf('-f') + 1]);
      cb(null, command === 'pdfinfo' ? pdfinfoStdout(3) : '', '');
    });

    await drain(new PopplerPdfRasterizer().rasterize(Buffer.from('%PDF-1.4'), OPTIONS));

    expect(pdftoppmCalls).toEqual(['1', '2', '3']);
  });

  it('uma página consumida de cada vez: pdftoppm da página 2 só corre depois de a página 1 ter sido lida (readFile) e eliminada (unlink)', async () => {
    const events: string[] = [];
    execFileMock.mockImplementation((command: string, args: string[], _opts: unknown, cb: ExecFileCallback) => {
      if (command === 'pdftoppm') events.push(`pdftoppm:${args[args.indexOf('-f') + 1]}`);
      cb(null, command === 'pdfinfo' ? pdfinfoStdout(2) : '', '');
    });
    readFileMock.mockImplementation(async () => {
      events.push('readFile');
      return Buffer.from('png-bytes');
    });
    unlinkMock.mockImplementation(async () => {
      events.push('unlink');
    });

    await drain(new PopplerPdfRasterizer().rasterize(Buffer.from('%PDF-1.4'), OPTIONS));

    expect(events).toEqual(['pdftoppm:1', 'readFile', 'unlink', 'pdftoppm:2', 'readFile', 'unlink']);
  });

  it('limite de páginas: pdfinfo reporta mais páginas do que maxPages → PdfPageLimitExceededError, pdftoppm nunca chamado', async () => {
    execFileMock.mockImplementation((command: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
      cb(null, command === 'pdfinfo' ? pdfinfoStdout(15) : '', '');
    });

    await expect(drain(new PopplerPdfRasterizer().rasterize(Buffer.from('%PDF'), OPTIONS))).rejects.toThrow(
      PdfPageLimitExceededError,
    );
    expect(execFileMock).not.toHaveBeenCalledWith('pdftoppm', expect.anything(), expect.anything(), expect.anything());
  });

  it('PDF inválido: pdfinfo falha com stderr de sintaxe → PdfInvalidError', async () => {
    execFileMock.mockImplementation((command: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
      const error = Object.assign(new Error('exit 1'), {});
      cb(error, '', "Syntax Error (88): Illegal character '{'\nCouldn't find trailer dictionary\n");
    });

    await expect(drain(new PopplerPdfRasterizer().rasterize(Buffer.from('lixo'), OPTIONS))).rejects.toThrow(
      PdfInvalidError,
    );
  });

  it('PDF sem páginas (Pages: 0) é rejeitado como inválido', async () => {
    execFileMock.mockImplementation((command: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
      cb(null, command === 'pdfinfo' ? pdfinfoStdout(0) : '', '');
    });

    await expect(drain(new PopplerPdfRasterizer().rasterize(Buffer.from('%PDF'), OPTIONS))).rejects.toThrow(
      PdfInvalidError,
    );
  });

  it('PDF protegido: pdfinfo falha com stderr de password → PdfProtectedError', async () => {
    execFileMock.mockImplementation((_command: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
      cb(new Error('exit 1'), '', 'Command Line Error: Incorrect password\n');
    });

    await expect(drain(new PopplerPdfRasterizer().rasterize(Buffer.from('%PDF'), OPTIONS))).rejects.toThrow(
      PdfProtectedError,
    );
  });

  it('timeout: erro com killed=true → PdfRasterizationTimeoutError', async () => {
    execFileMock.mockImplementation((_command: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
      cb(Object.assign(new Error('timed out'), { killed: true, signal: 'SIGTERM' }), '', '');
    });

    await expect(drain(new PopplerPdfRasterizer().rasterize(Buffer.from('%PDF'), OPTIONS))).rejects.toThrow(
      PdfRasterizationTimeoutError,
    );
  });

  it('falha do processo (binário em falta, ENOENT) → PdfRasterizerError', async () => {
    execFileMock.mockImplementation((_command: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
      cb(Object.assign(new Error('spawn pdfinfo ENOENT'), { code: 'ENOENT' }), '', '');
    });

    await expect(drain(new PopplerPdfRasterizer().rasterize(Buffer.from('%PDF'), OPTIONS))).rejects.toThrow(
      PdfRasterizerError,
    );
  });

  it('cleanup em sucesso: elimina o diretório temporário depois de consumir todas as páginas', async () => {
    execFileMock.mockImplementation((command: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
      cb(null, command === 'pdfinfo' ? pdfinfoStdout(1) : '', '');
    });

    await drain(new PopplerPdfRasterizer().rasterize(Buffer.from('%PDF'), OPTIONS));

    expect(rmMock).toHaveBeenCalledWith(TEMP_DIR, { recursive: true, force: true });
  });

  it('cleanup em erro: elimina o diretório temporário mesmo quando o PDF é inválido', async () => {
    execFileMock.mockImplementation((_command: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
      cb(new Error('exit 1'), '', 'Syntax Error\n');
    });

    await expect(drain(new PopplerPdfRasterizer().rasterize(Buffer.from('lixo'), OPTIONS))).rejects.toThrow();
    expect(rmMock).toHaveBeenCalledWith(TEMP_DIR, { recursive: true, force: true });
  });

  it('cleanup em timeout: elimina o diretório temporário mesmo quando o processo é morto por timeout', async () => {
    execFileMock.mockImplementation((_command: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
      cb(Object.assign(new Error('timed out'), { killed: true }), '', '');
    });

    await expect(drain(new PopplerPdfRasterizer().rasterize(Buffer.from('%PDF'), OPTIONS))).rejects.toThrow(
      PdfRasterizationTimeoutError,
    );
    expect(rmMock).toHaveBeenCalledWith(TEMP_DIR, { recursive: true, force: true });
  });

  it('argumentos enviados sem shell — execFile chamado com array de argumentos, nunca uma string concatenada', async () => {
    execFileMock.mockImplementation((command: string, args: string[], opts: Record<string, unknown>, cb: ExecFileCallback) => {
      expect(Array.isArray(args)).toBe(true);
      expect(opts.shell).toBeUndefined();
      cb(null, command === 'pdfinfo' ? pdfinfoStdout(1) : '', '');
    });

    await drain(new PopplerPdfRasterizer().rasterize(Buffer.from('%PDF'), OPTIONS));

    expect(execFileMock).toHaveBeenCalledWith(
      'pdftoppm',
      ['-f', '1', '-l', '1', '-singlefile', '-r', '200', '-png', `${TEMP_DIR}/input.pdf`, `${TEMP_DIR}/page-1`],
      expect.objectContaining({ cwd: TEMP_DIR }),
      expect.any(Function),
    );
  });

  it('o PDF é sempre escrito com um nome interno fixo ("input.pdf") — nunca um nome fornecido pelo utilizador', async () => {
    execFileMock.mockImplementation((command: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
      cb(null, command === 'pdfinfo' ? pdfinfoStdout(1) : '', '');
    });

    await drain(new PopplerPdfRasterizer().rasterize(Buffer.from('%PDF'), OPTIONS));

    // O contrato `rasterize(pdf: Buffer, options)` nem sequer aceita um
    // nome de ficheiro — estruturalmente impossível de o passar a um
    // comando. `writeFile` só pode ter sido chamado com o nome interno.
    expect(writeFileMock).toHaveBeenCalledWith(`${TEMP_DIR}/input.pdf`, expect.any(Buffer));
  });

  it('não amplia páginas pequenas/baixo DPI — DPI efetivo só reduz quando o tamanho nativo excede maxDimensionPx', async () => {
    let pdftoppmArgs: string[] = [];
    execFileMock.mockImplementation((command: string, args: string[], _opts: unknown, cb: ExecFileCallback) => {
      if (command === 'pdftoppm') pdftoppmArgs = args;
      // Página grande: 3000x2000pt a 200dpi -> 8333x5556px, muito acima de maxDimensionPx=2500.
      cb(null, command === 'pdfinfo' ? pdfinfoStdout(1, 3000, 2000) : '', '');
    });

    await drain(new PopplerPdfRasterizer().rasterize(Buffer.from('%PDF'), OPTIONS));

    const dpiArg = Number(pdftoppmArgs[pdftoppmArgs.indexOf('-r') + 1]);
    expect(dpiArg).toBeLessThan(OPTIONS.dpi);
    expect(pdftoppmArgs).not.toContain('-scale-to');
  });
});
