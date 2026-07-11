/**
 * Resultado de um único extractor sobre o texto OCR — forma partilhada
 * por todos os extractors, independentemente do tipo de valor que cada
 * um produz. `null` (nunca esta forma) significa "não encontrado", não
 * um valor de baixa confiança — ver `FiscalExtractor`.
 */
export interface ExtractionMatch<T> {
  /** Valor já interpretado (ex. `Date`, `number`), nunca a string bruta. */
  value: T;
  /** 0–100. Heurística por extractor — ver o comentário de cada um. */
  confidence: number;
  /** Excerto do texto OCR onde o valor foi encontrado, quando aplicável. */
  source?: string;
}
