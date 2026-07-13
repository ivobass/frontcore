/**
 * Diagnóstico da execução de `runDocumentExtractors()` — nunca duplica
 * confiança/fonte por campo (já vive em cada `ExtractionMatch` do
 * resultado); só informação sobre a execução do motor em si. Genérico
 * sobre `TField` para ser reutilizável por qualquer especialização de
 * documento (fatura, recibo, guia, ...), não só faturas.
 */
export interface DocumentExtractionMetadata<TField extends string> {
  /**
   * Um elemento por extractor corrido, não por campo único — se dois
   * extractors partilharem o mesmo campo (ex. dois candidatos por país,
   * ou um regex e um de IA a competir pelo mesmo campo), o mesmo `TField`
   * aparece duas vezes aqui. Para os campos únicos efetivamente
   * encontrados, ver `fieldsFound`.
   */
  extractorsRun: TField[];
  /** Campos únicos com pelo menos um match — nunca duplica, mesmo que vários extractors partilhem o campo. */
  fieldsFound: TField[];
  processingTimeMs: number;
  /** Comprimento do texto de entrada — diagnóstico de qualidade do input. */
  textLength: number;
}
