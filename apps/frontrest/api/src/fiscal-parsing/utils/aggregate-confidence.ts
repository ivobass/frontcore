import type { ExtractionMatch } from '../types';

/**
 * Agrega a confiança de todos os campos ENCONTRADOS (nunca de todos os
 * campos possíveis) num único valor 0–100 — média simples, todos os
 * campos pesam o mesmo. Isolada nesta função (em vez de inline em
 * `FiscalParsingService`) para que, se uma fase futura precisar de
 * pesos por campo (ex. `totals`/`vat` pesarem mais do que `customer` no
 * agregado), a mudança fique contida aqui — quem chama continua a
 * passar só a lista de matches encontrados, sem saber como o agregado é
 * calculado.
 *
 * **Este número mede só a confiança dos campos encontrados, nunca a
 * cobertura do documento** (Fase 6.8+, "false positive hardening" —
 * achado real: um documento com só fornecedor+data encontrados, ambos
 * de alta confiança, produzia um agregado "alto" que escondia estarem
 * 7 de 9 campos em falta). Para saber a cobertura, ver
 * `metadata.fieldsFound.length` (quantos campos foram encontrados) vs.
 * `metadata.extractorsRun.length` (quantos extractors existem) — os
 * dois números já estavam disponíveis em `FiscalExtractionMetadata`,
 * só nunca combinados com este agregado num único "score" (decisão
 * deliberada: um score composto cobertura×confiança seria uma
 * framework de scoring nova sem consumidor real a pedi-la — YAGNI,
 * `docs/ai/AI_BASE_PROMPT.md` secção 5). Um consumidor (ex. a UI) que
 * precise de ambos os sinais já os tem, separados, em
 * `result.confidence` e `result.metadata.fieldsFound`.
 *
 * Nunca mascara falsos positivos: um extractor endurecido
 * (`InvoiceNumberExtractor`, `TotalsExtractor`) que rejeita um
 * candidato duvidoso devolve `null` em vez de um `ExtractionMatch` —
 * esse campo nunca entra nesta lista, por isso nunca pode inflacionar
 * o agregado, mesmo tendo existido um candidato "confiante mas errado"
 * no texto OCR.
 */
export function aggregateConfidence(matches: ReadonlyArray<ExtractionMatch<unknown>>): number {
  if (matches.length === 0) {
    return 0;
  }
  const sum = matches.reduce((total, match) => total + match.confidence, 0);
  return Math.round(sum / matches.length);
}
