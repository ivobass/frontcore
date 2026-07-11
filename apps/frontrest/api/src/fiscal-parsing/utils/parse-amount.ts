/**
 * Interpreta um montante monetário escrito em qualquer dos dois formatos
 * decimais comuns — `1.234,56` (PT/EU, vírgula decimal) ou `1,234.56`
 * (EN/US, ponto decimal) — sem depender de `Intl`/locale do processo.
 * Heurística: com os dois separadores presentes, o que aparece por
 * último é o decimal; com um só separador, só é decimal se tiver
 * exatamente 1–2 dígitos a seguir (senão é separador de milhares).
 * Devolve `null` quando não há dígitos a interpretar.
 */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,-]/g, '').trim();
  if (!cleaned || !/\d/.test(cleaned)) {
    return null;
  }

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  let normalized: string;
  if (hasComma && hasDot) {
    const decimalSeparator = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.') ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
    normalized = cleaned.split(thousandsSeparator).join('').replace(decimalSeparator, '.');
  } else if (hasComma) {
    normalized = /,\d{1,2}$/.test(cleaned) ? cleaned.replace(',', '.') : cleaned.replace(/,/g, '');
  } else if (hasDot) {
    normalized = /\.\d{1,2}$/.test(cleaned) ? cleaned : cleaned.replace(/\./g, '');
  } else {
    normalized = cleaned;
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
