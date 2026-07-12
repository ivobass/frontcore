import type { PdfRasterizer } from '../contracts';
import { PopplerPdfRasterizer } from './poppler';

/**
 * Único ponto de construção de `PdfRasterizer` — mesma filosofia de
 * `createOcrProvider()`: `OCRService`/o Worker nunca importam
 * `PopplerPdfRasterizer` diretamente. Sem seleção por configuração
 * ainda (só existe uma implementação) — se um segundo rasterizer real
 * surgir, esta função ganha um `switch`, sem tocar em mais nenhum
 * consumidor.
 */
export function createPdfRasterizer(): PdfRasterizer {
  return new PopplerPdfRasterizer();
}
