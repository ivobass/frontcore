import { Prisma } from '@frontcore/database';

/**
 * Comparação entre dois valores de um mesmo indicador em dois períodos
 * (Fase 9, extraído de `reports.service.ts` para reutilização pelo
 * Chat IA na Fase 8.6) — `percentageChange` fica sempre `null` antes de
 * qualquer divisão quando o período anterior é zero, nunca `Infinity`/
 * `NaN` calculado e depois validado.
 */
export interface PeriodComparisonValue {
  current: string;
  previous: string;
  absoluteChange: string;
  percentageChange: number | null;
  direction: 'increase' | 'decrease' | 'unchanged';
}

/** Compara um valor monetário (`Decimal` como string, nunca `number`, para não perder precisão) entre dois períodos. */
export function compareAmount(current: string, previous: string): PeriodComparisonValue {
  const currentDecimal = new Prisma.Decimal(current);
  const previousDecimal = new Prisma.Decimal(previous);
  const absoluteChange = currentDecimal.minus(previousDecimal);
  return {
    current: currentDecimal.toFixed(2),
    previous: previousDecimal.toFixed(2),
    absoluteChange: absoluteChange.toFixed(2),
    percentageChange: previousDecimal.isZero()
      ? null
      : Number(absoluteChange.dividedBy(previousDecimal.abs()).times(100).toFixed(2)),
    direction: absoluteChange.isZero() ? 'unchanged' : absoluteChange.isPositive() ? 'increase' : 'decrease',
  };
}

/** Compara uma contagem inteira entre dois períodos (ex. número de faturas ativas). */
export function compareCount(current: number, previous: number): PeriodComparisonValue {
  const absoluteChange = current - previous;
  return {
    current: String(current),
    previous: String(previous),
    absoluteChange: String(absoluteChange),
    percentageChange:
      previous === 0 ? null : Number((((current - previous) / Math.abs(previous)) * 100).toFixed(2)),
    direction: absoluteChange === 0 ? 'unchanged' : absoluteChange > 0 ? 'increase' : 'decrease',
  };
}
