import type { DocumentExtractor } from './contracts';
import type { DocumentExtractionMetadata, ExtractionMatch } from './types';

export interface DocumentExtractionOutput<TField extends string> {
  matches: Map<TField, ExtractionMatch<unknown>>;
  metadata: DocumentExtractionMetadata<TField>;
}

/**
 * Motor genérico de extração de documentos — corre cada `DocumentExtractor`
 * de forma independente sobre o mesmo texto e resolve o resultado final.
 * Sem conhecimento de fatura, recibo, guia ou qualquer outro tipo de
 * documento — `fiscal-parsing/` (e futuras especializações) é quem dá
 * significado a `TField`/aos valores agregados aqui.
 *
 * Extractors correm em paralelo (`Promise.all`) — cada um é independente,
 * nenhum lê o resultado de outro, e paralelismo é o que torna esta
 * assinatura útil para um extractor de IA com I/O de rede (custaria uma
 * chamada em série por extractor se fosse sequencial). Para os
 * extractors regex de hoje (síncronos por natureza, só embrulhados em
 * `Promise`), não há diferença observável de latência.
 *
 * Resolução de conflitos: se mais do que um extractor devolver um match
 * para o mesmo campo (dois candidatos por país, ou um extractor regex e
 * um de IA a competir pelo mesmo campo), vence o de maior confiança —
 * nunca "o último a resolver". Em empate exato, vence o primeiro
 * elemento de `extractors` (regra determinística, não arbitrária) —
 * preservado por construção, porque `Promise.all` devolve os resultados
 * na mesma ordem do array de entrada, independentemente da ordem real de
 * resolução.
 */
export async function runDocumentExtractors<TField extends string>(
  extractors: DocumentExtractor<TField, unknown>[],
  ocrText: string,
): Promise<DocumentExtractionOutput<TField>> {
  const startedAt = Date.now();
  const matches = new Map<TField, ExtractionMatch<unknown>>();

  const results = await Promise.all(extractors.map((extractor) => extractor.extract(ocrText)));

  results.forEach((match, index) => {
    if (!match) {
      return;
    }
    const field = extractors[index].field;
    const existing = matches.get(field);
    if (!existing || match.confidence > existing.confidence) {
      matches.set(field, match);
    }
  });

  return {
    matches,
    metadata: {
      extractorsRun: extractors.map((extractor) => extractor.field),
      fieldsFound: [...matches.keys()],
      processingTimeMs: Date.now() - startedAt,
      textLength: ocrText.length,
    },
  };
}
