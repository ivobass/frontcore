import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import type { PdfRasterizer } from '../../contracts';
import type { PdfRasterizationOptions, RasterizedPage } from '../../types';
import {
  PdfInvalidError,
  PdfPageLimitExceededError,
  PdfProtectedError,
  PdfRasterizationTimeoutError,
  PdfRasterizerError,
} from '../../errors';

/**
 * Limite de `stdout`/`stderr` capturados por processo filho — proteção
 * contra saída anómala, nunca esperada em uso normal (`pdfinfo`/
 * `pdftoppm` só escrevem algumas linhas em sucesso, ver validação
 * empírica em `docs/phases/phase-6.9-pdf-rasterization-foundation.md`).
 */
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

interface PopplerExecError extends Error {
  killed?: boolean;
  signal?: string | null;
  code?: string | number | null;
  stdout?: string;
  stderr?: string;
}

/** Corre `pdfinfo`/`pdftoppm` via `execFile` — nunca `exec`, nunca `shell: true`, nunca interpolação de string num comando. */
function runPoppler(
  command: 'pdfinfo' | 'pdftoppm',
  args: string[],
  options: { cwd: string; timeoutMs: number },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        cwd: options.cwd,
        timeout: options.timeoutMs,
        killSignal: 'SIGTERM',
        maxBuffer: MAX_BUFFER_BYTES,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(Object.assign(error as PopplerExecError, { stdout, stderr }));
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

/**
 * `-scale-to` do `pdftoppm` **não é só um limite** — força cada página a
 * caber exatamente numa caixa `scale-to × scale-to`, incluindo ampliar
 * páginas pequenas/de baixa resolução (confirmado empiricamente: uma
 * página rasterizada a 50dpi com `-scale-to 2500` sai a 2500×1250, em
 * vez de manter o tamanho nativo, muito menor). Ampliar artificialmente
 * uma imagem piora a qualidade que chega ao Tesseract, o oposto do que
 * `maxDimensionPx` pretende. Por isso `maxDimensionPx` nunca é passado
 * como `-scale-to` — é aplicado **reduzindo o DPI efetivo** só quando o
 * tamanho nativo (`pageSizePts / 72 * dpi`) excederia o limite; nunca
 * aumenta o DPI pedido.
 */
function computeEffectiveDpi(
  pageWidthPts: number,
  pageHeightPts: number,
  requestedDpi: number,
  maxDimensionPx: number,
): number {
  const nativeWidthPx = (pageWidthPts / 72) * requestedDpi;
  const nativeHeightPx = (pageHeightPts / 72) * requestedDpi;
  const largestDimensionPx = Math.max(nativeWidthPx, nativeHeightPx);
  if (largestDimensionPx <= maxDimensionPx || largestDimensionPx === 0) {
    return requestedDpi;
  }
  return requestedDpi * (maxDimensionPx / largestDimensionPx);
}

/**
 * Classifica uma falha de `pdfinfo`/`pdftoppm` num dos erros tipados de
 * `@frontcore/ocr` — nunca propaga stderr/comando bruto para fora desta
 * função; só a mensagem sanitizada e curta de cada classe (o Worker,
 * `sanitizeOcrError()`, decide a mensagem final a persistir). O `cause`
 * mantém o erro original só para os logs do Worker (`error.stack`),
 * nunca para `InvoiceDraft.ocrError`.
 */
function classifyPopplerError(error: unknown, stage: 'pdfinfo' | 'pdftoppm'): Error {
  const execError = error as PopplerExecError;

  if (execError.killed || execError.signal === 'SIGTERM') {
    return new PdfRasterizationTimeoutError(
      `Tempo limite excedido durante a execução de ${stage}.`,
      { cause: error },
    );
  }
  if (execError.code === 'ENOENT') {
    return new PdfRasterizerError(`Binário "${stage}" não encontrado no runtime do Worker.`, {
      cause: error,
    });
  }

  const stderr = (execError.stderr ?? '').toLowerCase();
  if (stderr.includes('password')) {
    return new PdfProtectedError('Documento PDF protegido por password.', { cause: error });
  }
  if (
    stderr.includes('syntax error') ||
    stderr.includes('trailer') ||
    stderr.includes("couldn't") ||
    stderr.includes('i/o error')
  ) {
    return new PdfInvalidError('Documento PDF inválido ou corrompido.', { cause: error });
  }

  return new PdfRasterizerError(`Falha ao executar ${stage}.`, { cause: error });
}

/**
 * Rasterizer PDF baseado no Poppler (`pdfinfo`/`pdftoppm`), instalado
 * como binário de sistema no container do Worker (`docker/workers.Dockerfile`).
 * Escolhido sobre PDF.js+Canvas (bindings nativos frágeis em Alpine),
 * MuPDF e Ghostscript/ImageMagick — comparação completa em
 * `docs/phases/phase-6.9-pdf-rasterization-foundation.md`.
 *
 * Cada `rasterize()` cria um diretório temporário exclusivo
 * (`fs.mkdtemp`), nunca reutiliza nomes entre chamadas concorrentes —
 * dois documentos processados ao mesmo tempo nunca colidem. O PDF de
 * entrada é sempre escrito com um nome interno fixo (`input.pdf`),
 * nunca o nome original do utilizador — esse nome nunca chega a um
 * argumento de comando.
 */
export class PopplerPdfRasterizer implements PdfRasterizer {
  readonly name = 'poppler';

  async *rasterize(
    pdf: Buffer,
    options: PdfRasterizationOptions,
  ): AsyncGenerator<RasterizedPage> {
    const tempDir = await mkdtemp(join(tmpdir(), 'frontcore-ocr-pdf-'));
    const pdfPath = join(tempDir, 'input.pdf');

    try {
      await writeFile(pdfPath, pdf);

      const { pageCount, pageWidthPts, pageHeightPts } = await this.inspectDocument(
        pdfPath,
        options.timeoutMs,
      );
      if (pageCount === 0) {
        throw new PdfInvalidError('Documento PDF sem páginas.');
      }
      if (pageCount > options.maxPages) {
        throw new PdfPageLimitExceededError(
          `Documento tem ${pageCount} páginas, acima do limite de ${options.maxPages}.`,
        );
      }

      // Baseado no tamanho da 1ª página — aproximação aceite para o
      // limite de segurança (`maxDimensionPx`); documentos com páginas
      // de tamanhos muito diferentes entre si não são o caso comum de
      // uma fatura, fora do âmbito tratar com precisão por página.
      const effectiveDpi = computeEffectiveDpi(
        pageWidthPts,
        pageHeightPts,
        options.dpi,
        options.maxDimensionPx,
      );

      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        const outPrefix = join(tempDir, `page-${pageNumber}`);
        await this.renderPage(pdfPath, pageNumber, outPrefix, effectiveDpi, options.timeoutMs);

        const pngPath = `${outPrefix}.png`;
        const buffer = await readFile(pngPath);
        await unlink(pngPath);

        yield { pageNumber, buffer, contentType: 'image/png' };
      }
    } finally {
      // Sempre corre — sucesso, erro a meio, ou o consumidor a parar
      // cedo (`for await...of` com `break`/`throw` invoca o `return()`
      // do generator, que passa por este `finally`).
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private async inspectDocument(
    pdfPath: string,
    timeoutMs: number,
  ): Promise<{ pageCount: number; pageWidthPts: number; pageHeightPts: number }> {
    let result: { stdout: string; stderr: string };
    try {
      result = await runPoppler('pdfinfo', [pdfPath], { cwd: dirname(pdfPath), timeoutMs });
    } catch (error) {
      throw classifyPopplerError(error, 'pdfinfo');
    }

    const pagesMatch = /^Pages:\s+(\d+)/m.exec(result.stdout);
    if (!pagesMatch) {
      throw new PdfInvalidError('Não foi possível determinar o número de páginas do documento.');
    }

    const sizeMatch = /^Page size:\s+([\d.]+) x ([\d.]+) pts/m.exec(result.stdout);
    return {
      pageCount: Number(pagesMatch[1]),
      pageWidthPts: sizeMatch ? Number(sizeMatch[1]) : 0,
      pageHeightPts: sizeMatch ? Number(sizeMatch[2]) : 0,
    };
  }

  private async renderPage(
    pdfPath: string,
    pageNumber: number,
    outPrefix: string,
    dpi: number,
    timeoutMs: number,
  ): Promise<void> {
    try {
      await runPoppler(
        'pdftoppm',
        [
          '-f',
          String(pageNumber),
          '-l',
          String(pageNumber),
          '-singlefile',
          '-r',
          String(dpi),
          '-png',
          pdfPath,
          outPrefix,
        ],
        { cwd: dirname(pdfPath), timeoutMs },
      );
    } catch (error) {
      throw classifyPopplerError(error, 'pdftoppm');
    }
  }
}
