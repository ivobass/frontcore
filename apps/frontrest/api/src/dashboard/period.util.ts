import { BadRequestException } from '@nestjs/common';

/**
 * Resolução do período do dashboard financeiro (Fase 7) — sempre em
 * UTC, nunca no timezone local do processo Node, para o limite de um
 * período nunca deslocar um dia consoante onde o servidor corre.
 * "Mês atual" também é lido em UTC (`getUTCFullYear`/`getUTCMonth`) —
 * mesma convenção já usada em `fiscal-parsing/utils/parse-flexible-date.ts`
 * (`isPlausibleYear`/`buildUtcDate`), reaproveitada aqui só como
 * padrão, não como import direto (módulos de domínio distintos).
 */
export interface ResolvedPeriod {
  /** ISO `YYYY-MM-DD`, devolvido ao consumidor tal como pedido (inclusivo). */
  from: string;
  /** ISO `YYYY-MM-DD`, devolvido ao consumidor tal como pedido (inclusivo). */
  to: string;
  /** Limite inferior UTC, inclusivo — para a cláusula `issueDate: { gte, lt }`. */
  gte: Date;
  /** Limite superior UTC, exclusivo (`to` + 1 dia) — nunca exposto ao consumidor. */
  lt: Date;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Interpreta `value` como data de calendário real em UTC — rejeita "2026-02-30" (forma válida, dia inexistente), nunca deixa o `Date` nativo fazer rollover silencioso. */
function parseIsoDateUtc(value: string, label: string): Date {
  if (!ISO_DATE.test(value)) {
    throw new BadRequestException(`"${label}" deve estar no formato YYYY-MM-DD.`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isValid =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!isValid) {
    throw new BadRequestException(`"${label}" não é uma data de calendário válida.`);
  }
  return date;
}

function firstDayOfCurrentMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function lastDayOfCurrentMonthUtc(): Date {
  const now = new Date();
  // Dia 0 do mês seguinte = último dia do mês atual (comportamento nativo do `Date.UTC`).
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Resolve `from`/`to` (strings ISO opcionais, já validadas na forma
 * por `@IsDateString()` no DTO) para os limites reais do período —
 * omissos por omissão para o mês atual; rejeita datas de calendário
 * impossíveis e `from > to`. Início inclusivo, fim exclusivo
 * internamente (`lt`); `from`/`to` devolvidos continuam inclusivos do
 * ponto de vista do consumidor da API.
 */
export function resolvePeriod(fromInput?: string, toInput?: string): ResolvedPeriod {
  const fromDate = fromInput ? parseIsoDateUtc(fromInput, 'from') : firstDayOfCurrentMonthUtc();
  const toDate = toInput ? parseIsoDateUtc(toInput, 'to') : lastDayOfCurrentMonthUtc();

  if (fromDate.getTime() > toDate.getTime()) {
    throw new BadRequestException('"from" não pode ser posterior a "to".');
  }

  const exclusiveEnd = new Date(toDate.getTime());
  exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);

  return {
    from: toIsoDate(fromDate),
    to: toIsoDate(toDate),
    gte: fromDate,
    lt: exclusiveEnd,
  };
}
