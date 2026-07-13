import type { ExtractionMatch } from '../types';

/**
 * Contrato genérico de um extractor de campos de um documento —
 * independente do tipo de documento (fatura, recibo, guia, encomenda,
 * orçamento, nota de crédito, ...) e do mecanismo interno (regex/
 * heurísticas, IA, modelo local, modelo cloud). `TField` é o enum de
 * campos da especialização concreta (ex. `FiscalField`, em
 * `apps/frontrest/api/src/fiscal-parsing/`) — este contrato não conhece
 * nenhum enum específico.
 *
 * `extract()` é assíncrono deliberadamente: cobre tanto extractors
 * síncronos por natureza (regex — devolvem o valor diretamente, uma
 * função `async` embrulha-o numa `Promise` já resolvida sem custo real)
 * como extractors que precisam de I/O (um provider de IA via
 * `@frontcore/ai`, um modelo local correndo como processo externo).
 * `null` significa "não encontrado", nunca uma exceção — um extractor
 * nunca lança para dados em falta, só para erros de programação
 * genuínos.
 */
export interface DocumentExtractor<TField extends string, TValue> {
  /** Campo que este extractor cobre — usado pelo motor para agregar o resultado. */
  readonly field: TField;

  /** Analisa `ocrText` e devolve o melhor match, ou `null` se não encontrar nada. */
  extract(ocrText: string): Promise<ExtractionMatch<TValue> | null>;
}
