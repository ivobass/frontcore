import { BadRequestException } from '@nestjs/common';
import { resolvePeriod } from '../dashboard/period.util';
import type { ResolvedPeriod } from '../dashboard/period.util';

/**
 * Resolução de mês (`YYYY-MM`) para o relatório financeiro mensal
 * (Fase 9) — nunca duplica `resolvePeriod()` (Fase 7): calcula só o
 * primeiro/último dia ISO do mês pedido e delega nele toda a validação
 * de calendário e a construção dos limites UTC (`gte`/`lt`).
 */
export interface ResolvedMonth extends ResolvedPeriod {
  /** `YYYY-MM` do mês resolvido, ecoado tal como pedido. */
  month: string;
}

const MONTH_FORMAT = /^\d{4}-\d{2}$/;

function parseMonth(value: string, label: string): { year: number; month: number } {
  if (!MONTH_FORMAT.test(value)) {
    throw new BadRequestException(`"${label}" deve estar no formato YYYY-MM.`);
  }
  const [year, month] = value.split('-').map(Number);
  if (month < 1 || month > 12) {
    throw new BadRequestException(`"${label}" tem um mês inválido — deve estar entre 01 e 12.`);
  }
  return { year, month };
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function firstDayIso(year: number, month: number): string {
  return `${year}-${pad2(month)}-01`;
}

/** Último dia do mês (1-based) — mesma técnica de "dia 0 do mês seguinte" já usada em `period.util.ts`. */
function lastDayIso(year: number, month: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad2(month)}-${pad2(lastDay)}`;
}

/** Resolve `YYYY-MM` para os limites UTC do mês, reutilizando `resolvePeriod()` para a validação/construção final. */
export function resolveMonth(value: string): ResolvedMonth {
  const { year, month } = parseMonth(value, 'month');
  const from = firstDayIso(year, month);
  const to = lastDayIso(year, month);
  const period = resolvePeriod(from, to);
  return { ...period, month: value };
}

/**
 * Mês anterior a `value`, sempre `YYYY-MM` — reutiliza a normalização
 * nativa de `Date.UTC` para a transição janeiro → dezembro do ano
 * anterior (mês zero-based `-1` recua automaticamente o ano), mesmo
 * idioma já usado em `period.util.ts`.
 */
export function previousMonth(value: string): string {
  const { year, month } = parseMonth(value, 'month');
  const prevDate = new Date(Date.UTC(year, month - 2, 1));
  return `${prevDate.getUTCFullYear()}-${pad2(prevDate.getUTCMonth() + 1)}`;
}

/** `YYYY-MM` do mês atual em UTC — omissão do endpoint, mesma convenção de `resolvePeriod()` para o dashboard. */
export function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}`;
}
