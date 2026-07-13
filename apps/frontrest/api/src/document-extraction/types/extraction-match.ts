/**
 * Resultado de um único extractor sobre o texto de um documento — forma
 * partilhada por qualquer extractor, independentemente do tipo de valor
 * que produz, do tipo de documento (fatura, recibo, guia, ...) ou do
 * mecanismo interno (regex, IA, modelo local, modelo cloud). `null`
 * (nunca esta forma) significa "não encontrado", não um valor de baixa
 * confiança — ver `DocumentExtractor`.
 */
export interface ExtractionMatch<T> {
  /** Valor já interpretado (ex. `Date`, `number`), nunca a string bruta. */
  value: T;
  /** 0–100. Heurística por extractor — ver o comentário de cada um. */
  confidence: number;
  /** Excerto do texto de origem onde o valor foi encontrado, quando aplicável. */
  source?: string;
}
