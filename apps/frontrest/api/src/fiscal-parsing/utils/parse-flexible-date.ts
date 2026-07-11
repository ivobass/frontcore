const ISO_DATE = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/;
const DMY_DATE = /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b/;

/**
 * Interpreta uma data em formato numérico — `YYYY-MM-DD` (ISO,
 * inequívoco) ou `DD/MM/YYYY` (`/`, `-` ou `.` como separador).
 * Convenção dia-mês assumida para o formato de 3 partes — produto
 * inicialmente PT/EU; `MM/DD/YYYY` (EN-US) não é suportado nesta fase,
 * ver limitações conhecidas em
 * `docs/phases/phase-6.6-fiscal-parsing-foundation.md`. Nomes de mês
 * por extenso (ex. "12 de Julho de 2026") também não são suportados —
 * mesma razão. Devolve `null` para datas sintaticamente inválidas (ex.
 * 31/02) em vez de deixar o `Date` nativo fazer rollover para o mês
 * seguinte.
 */
export function parseFlexibleDate(raw: string): Date | null {
  const isoMatch = raw.match(ISO_DATE);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return buildUtcDate(Number(year), Number(month), Number(day));
  }

  const dmyMatch = raw.match(DMY_DATE);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    return buildUtcDate(Number(year), Number(month), Number(day));
  }

  return null;
}

function buildUtcDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  const isValid =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return isValid ? date : null;
}
