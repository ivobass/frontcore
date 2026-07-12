/** Resultado de OCR de uma única página, o suficiente para agregação. */
export interface PdfPageOcrResult {
  pageNumber: number;
  text: string;
  confidence: number;
}

/** Cabeçalho de separação entre páginas no texto agregado — testado explicitamente, nunca alterado sem atualizar o teste. */
export function formatPageSeparator(pageNumber: number): string {
  return `--- Página ${pageNumber} ---`;
}

/**
 * Remove só as quebras de linha finais (fronteira entre páginas) —
 * nunca quebras internas do texto OCR. `\n+$` está ancorado ao fim da
 * string, por isso "linha 1\n\nlinha 2" mantém a quebra interna intacta,
 * só "texto\n", "texto\n\n\n" e "texto" colapsam todos no mesmo "texto".
 */
function stripTrailingNewlines(text: string): string {
  return text.replace(/\n+$/, '');
}

/**
 * Concatena o texto de todas as páginas, pela ordem. **Nunca** insere
 * marcador antes da 1ª página — um PDF de uma única página produz
 * exatamente o texto OCR normalizado dessa página, indistinguível de
 * uma imagem processada diretamente (mesmo contrato para quem consome
 * `ocrText`, incluindo `SupplierExtractor`, que usa a 1ª linha como
 * fallback quando não há rótulo — um marcador artificial ali seria
 * sempre apanhado como um falso "nome de fornecedor", achado real da
 * Fase 6.9, corrigido aqui).
 *
 * A partir da 2ª página, o marcador aparece **antes** do texto que
 * identifica — nunca depois:
 *
 * ```text
 * <texto da página 1>
 *
 * --- Página 2 ---
 *
 * <texto da página 2>
 * ```
 *
 * Cada página tem as suas quebras de linha finais removidas antes de
 * montar as fronteiras — evita que o resultado dependa de o Tesseract
 * (ou qualquer provider) devolver texto já terminado em `\n` ou não;
 * quebras internas nunca são tocadas.
 */
export function aggregatePdfText(pages: PdfPageOcrResult[]): string {
  return pages
    .map((page, index) => {
      const text = stripTrailingNewlines(page.text);
      return index === 0 ? text : `${formatPageSeparator(page.pageNumber)}\n\n${text}`;
    })
    .join('\n\n');
}

/**
 * Média da confiança ponderada pelo número de caracteres não vazios de
 * cada página — uma página vazia (0 caracteres úteis) tem peso zero,
 * nunca puxa a média para baixo só por existir. Se todas as páginas
 * estiverem vazias, devolve `0` em vez de `NaN`. Resultado sempre
 * dentro de 0–100 (assumindo que cada `confidence` de entrada já o
 * está, garantido pelo contrato de `OCRResult`).
 */
export function aggregatePdfConfidence(pages: PdfPageOcrResult[]): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const page of pages) {
    const weight = page.text.trim().length;
    weightedSum += page.confidence * weight;
    totalWeight += weight;
  }

  return totalWeight === 0 ? 0 : weightedSum / totalWeight;
}
