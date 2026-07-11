import type { ExtractionMatch } from '../types';

/**
 * Agrega a confiança de todos os campos encontrados num único valor
 * 0–100. Hoje, média simples — todos os campos pesam o mesmo. Isolada
 * nesta função (em vez de inline em `FiscalParsingService`) para que,
 * se uma fase futura precisar de pesos por campo (ex. `totals`/`vat`
 * pesarem mais do que `customer` no agregado), a mudança fique contida
 * aqui — quem chama continua a passar só a lista de matches encontrados,
 * sem saber como o agregado é calculado.
 */
export function aggregateConfidence(matches: ReadonlyArray<ExtractionMatch<unknown>>): number {
  if (matches.length === 0) {
    return 0;
  }
  const sum = matches.reduce((total, match) => total + match.confidence, 0);
  return Math.round(sum / matches.length);
}
