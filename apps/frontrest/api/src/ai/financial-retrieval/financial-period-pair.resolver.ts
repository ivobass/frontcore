import { resolveFinancialPeriod } from './financial-period.resolver';
import type { ResolvedPeriod } from '../../dashboard/period.util';

/**
 * Resolução de dois períodos explicitamente nomeados na mesma mensagem
 * (Fase 8.6) — "compara maio com junho", "compara janeiro com
 * fevereiro", "este mês versus o mês passado". Nunca resolve comparação
 * relativa a um período discutido antes na conversa (fora do âmbito
 * desta fase, candidata a fase futura) — cada lado da comparação vem
 * sempre da mensagem atual, resolvido por `resolveFinancialPeriod()`
 * (Fase 8.1), nunca uma segunda semântica de datas.
 *
 * O primeiro período mencionado é sempre `current` (o sujeito da
 * pergunta), o segundo é sempre `previous` (a referência) — decisão de
 * desenho simples e determinística; sem ordem cronológica implícita
 * quando ambos os períodos são meses nomeados sem relação entre si
 * (ex. "compara maio com junho" não tem uma leitura temporal óbvia).
 */
export type FinancialPeriodPairResolution =
  | { kind: 'RESOLVED'; current: ResolvedPeriod; previous: ResolvedPeriod }
  | { kind: 'MISSING' }
  | { kind: 'AMBIGUOUS' };

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

// "compara maio com junho" / "comparar janeiro com fevereiro" — exige o
// verbo explícito, distinto de COMPARISON_PATTERN em
// financial-intent.resolver.ts (que só deteta a palavra, sem separar os
// dois lados).
const COMPARA_COM_PATTERN = /^compara(r)?\s+(.+?)\s+com\s+(.+)$/;
// "este mes versus o mes passado" / "janeiro vs fevereiro" — sem verbo,
// separador "versus"/"vs" entre os dois períodos.
const VERSUS_PATTERN = /^(.+?)\s+(?:versus|vs)\s+(.+)$/;

/**
 * Divide uma mensagem de comparação em dois textos de período — pura,
 * sem resolução de datas. Reutilizada tanto pela deteção de intenção
 * (`financial-intent.resolver.ts`, só a forma importa) como por
 * `resolveFinancialPeriodPair()` (forma + resolução) — nunca duas
 * definições divergentes do que conta como "mensagem de comparação".
 */
export function splitComparisonPeriods(text: string): [string, string] | null {
  const normalized = normalize(text);
  const comparaMatch = normalized.match(COMPARA_COM_PATTERN);
  if (comparaMatch) {
    return [comparaMatch[2], comparaMatch[3]];
  }
  const versusMatch = normalized.match(VERSUS_PATTERN);
  if (versusMatch) {
    return [versusMatch[1], versusMatch[2]];
  }
  return null;
}

/**
 * Resolve os dois períodos de uma mensagem de comparação. `MISSING`
 * cobre tanto "não é uma mensagem de comparação" como "é, mas um dos
 * lados não resolveu nenhum período" — mesma distinção MISSING/AMBIGUOUS
 * de `resolveFinancialPeriod()`, nunca uma exceção.
 */
export function resolveFinancialPeriodPair(text: string, now: Date = new Date()): FinancialPeriodPairResolution {
  const split = splitComparisonPeriods(text);
  if (!split) {
    return { kind: 'MISSING' };
  }

  const [currentText, previousText] = split;
  const currentResolution = resolveFinancialPeriod(currentText, now);
  const previousResolution = resolveFinancialPeriod(previousText, now);

  if (currentResolution.kind === 'AMBIGUOUS' || previousResolution.kind === 'AMBIGUOUS') {
    return { kind: 'AMBIGUOUS' };
  }
  if (currentResolution.kind === 'MISSING' || previousResolution.kind === 'MISSING') {
    return { kind: 'MISSING' };
  }
  return { kind: 'RESOLVED', current: currentResolution.period, previous: previousResolution.period };
}
