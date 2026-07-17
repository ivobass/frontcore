import { resolvePeriod } from '../../dashboard/period.util';
import type { ResolvedPeriod } from '../../dashboard/period.util';
import { resolveMonth, previousMonth, currentMonth } from '../../reports/month.util';

/**
 * Resolução determinística de períodos financeiros a partir de texto em
 * português de Portugal (Fase 8.1) — nunca o LLM. Reutiliza sempre
 * `resolvePeriod()` (Fase 7) e `resolveMonth()`/`previousMonth()`/
 * `currentMonth()` (Fase 9) para a validação de calendário e construção
 * dos limites UTC — nunca uma segunda semântica temporal. `MISSING`
 * (nenhuma expressão de período reconhecida) e `AMBIGUOUS` (uma expressão
 * temporal foi reconhecida mas não resolve para um período concreto, ou
 * resolve para um intervalo impossível) são distintos, para o contexto do
 * chat poder orientar o utilizador de forma diferente em cada caso — nunca
 * cair silenciosamente no mês atual.
 */
export type FinancialPeriodResolution =
  | { kind: 'RESOLVED'; period: ResolvedPeriod }
  | { kind: 'MISSING' }
  | { kind: 'AMBIGUOUS' };

const MONTH_NAMES: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

// Conjunto mínimo confirmado pelo âmbito da fase (ex. "no Natal", "esta
// semana") — distinta de uma pergunta sem nenhuma expressão de período.
// Não alargar sem um exemplo concreto do âmbito a justificar.
const AMBIGUOUS_TRIGGERS = /\b(natal|semana)\b/;

const YEAR_CURRENT_PATTERN = /\b(este ano|deste ano|neste ano|ano atual)\b/;
const YEAR_PREVIOUS_PATTERN = /\b(ano passado|ano anterior)\b/;
const MONTH_CURRENT_PATTERN = /\b(este mes|deste mes|neste mes|mes atual)\b/;
const MONTH_PREVIOUS_PATTERN = /\b(mes passado|mes anterior)\b/;
const EXPLICIT_RANGE_PATTERN =
  /\bde\s+([a-z]+)(?:\s+de\s+(\d{4}))?\s+a\s+([a-z]+)\s+de\s+(\d{4})\b/;
const EXPLICIT_MONTH_YEAR_PATTERN = /\b([a-z]+)\s+de\s+(\d{4})\b/;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function firstDayIso(year: number, month: number): string {
  return `${year}-${pad2(month)}-01`;
}

function lastDayIso(year: number, month: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad2(month)}-${pad2(lastDay)}`;
}

function resolveYearPeriod(year: number): ResolvedPeriod {
  return resolvePeriod(`${year}-01-01`, `${year}-12-31`);
}

/** `resolvePeriod()`/`resolveMonth()` lançam em datas de calendário impossíveis ou `from > to` — aqui isso é sempre `AMBIGUOUS`, nunca uma exceção. */
function tryResolve(build: () => ResolvedPeriod): FinancialPeriodResolution {
  try {
    return { kind: 'RESOLVED', period: build() };
  } catch {
    return { kind: 'AMBIGUOUS' };
  }
}

export function resolveFinancialPeriod(text: string, now: Date = new Date()): FinancialPeriodResolution {
  const normalized = normalize(text);
  const currentYear = now.getUTCFullYear();

  const rangeMatch = normalized.match(EXPLICIT_RANGE_PATTERN);
  if (rangeMatch) {
    const [, monthFromName, yearFromRaw, monthToName, yearToRaw] = rangeMatch;
    const monthFrom = MONTH_NAMES[monthFromName];
    const monthTo = MONTH_NAMES[monthToName];
    if (monthFrom && monthTo) {
      const yearTo = Number(yearToRaw);
      const yearFrom = yearFromRaw ? Number(yearFromRaw) : yearTo;
      return tryResolve(() => resolvePeriod(firstDayIso(yearFrom, monthFrom), lastDayIso(yearTo, monthTo)));
    }
  }

  const monthYearMatch = normalized.match(EXPLICIT_MONTH_YEAR_PATTERN);
  if (monthYearMatch) {
    const month = MONTH_NAMES[monthYearMatch[1]];
    if (month) {
      const year = Number(monthYearMatch[2]);
      return tryResolve(() => resolveMonth(`${year}-${pad2(month)}`));
    }
  }

  if (YEAR_CURRENT_PATTERN.test(normalized)) {
    return tryResolve(() => resolveYearPeriod(currentYear));
  }
  if (YEAR_PREVIOUS_PATTERN.test(normalized)) {
    return tryResolve(() => resolveYearPeriod(currentYear - 1));
  }
  if (MONTH_CURRENT_PATTERN.test(normalized)) {
    return tryResolve(() => resolveMonth(currentMonth(now)));
  }
  if (MONTH_PREVIOUS_PATTERN.test(normalized)) {
    return tryResolve(() => resolveMonth(previousMonth(currentMonth(now))));
  }

  for (const [name, month] of Object.entries(MONTH_NAMES)) {
    if (new RegExp(`\\b${name}\\b`).test(normalized)) {
      return tryResolve(() => resolveMonth(`${currentYear}-${pad2(month)}`));
    }
  }

  if (AMBIGUOUS_TRIGGERS.test(normalized)) {
    return { kind: 'AMBIGUOUS' };
  }

  return { kind: 'MISSING' };
}
