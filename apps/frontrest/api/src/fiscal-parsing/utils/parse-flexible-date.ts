import { normalizeOcrDigits, DIGIT_LIKE_CLASS } from './ocr-normalize';

// Cada grupo aceita letras confundíveis com dígitos (`DIGIT_LIKE_CLASS`),
// não só `\d` — achado real: um ano pode chegar do OCR como "20Z6" em
// vez de "2026". Normalizado (`normalizeOcrDigits`) antes de `Number(...)`
// em `parseFlexibleDate`; se o resultado não ficar puramente numérico,
// `buildUtcDate` acaba por rejeitar de qualquer forma (`Number(...)`
// de uma string não numérica produz `NaN`, que falha a validação de
// mês/dia/ano). Datas são sempre puramente numéricas — ao contrário de
// um número de fatura, não há aqui nenhum caso legítimo de letra real
// misturada com dígitos, por isso esta troca nunca arrisca inventar um
// valor.
const D = DIGIT_LIKE_CLASS;
const ISO_DATE = new RegExp(`\\b(${D}{4})-(${D}{1,2})-(${D}{1,2})\\b`);
const DMY_DATE = new RegExp(`\\b(${D}{1,2})[/\\-.](${D}{1,2})[/\\-.](${D}{4})\\b`);

/**
 * Ano mínimo plausível para uma data de documento fiscal neste produto —
 * qualquer valor abaixo disto é quase sempre ruído de OCR (ex. "0026" em
 * vez de "2026"), nunca um documento real.
 */
const MIN_PLAUSIBLE_YEAR = 2000;

/**
 * Anos de folga acima do ano corrente — cobre datas de vencimento
 * legitimamente futuras (ex. pagamento a 60/90 dias que atravesse a
 * virada do ano) sem aceitar ruído de OCR flagrante. Achado real
 * (validação manual, "Farmácia Esperança"): um dígito trocado por OCR
 * transformou "2026" em "2096" — 70 anos no futuro, muito além de
 * qualquer prazo de pagamento real.
 */
const MAX_PLAUSIBLE_YEARS_AHEAD = 2;

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
 * seguinte, e também para anos implausíveis (ver `MIN_PLAUSIBLE_YEAR`/
 * `MAX_PLAUSIBLE_YEARS_AHEAD`) — aplicado aqui, no parser partilhado,
 * para cobrir tanto `InvoiceDateExtractor` como `DueDateExtractor` sem
 * duplicar a regra em cada um.
 */
export function parseFlexibleDate(raw: string): Date | null {
  const isoMatch = raw.match(ISO_DATE);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return buildUtcDate(
      Number(normalizeOcrDigits(year)),
      Number(normalizeOcrDigits(month)),
      Number(normalizeOcrDigits(day)),
    );
  }

  const dmyMatch = raw.match(DMY_DATE);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    return buildUtcDate(
      Number(normalizeOcrDigits(year)),
      Number(normalizeOcrDigits(month)),
      Number(normalizeOcrDigits(day)),
    );
  }

  return null;
}

/**
 * `true` para uma data estritamente posterior a hoje (UTC) — usado só
 * por `InvoiceDateExtractor`: uma fatura nunca pode ter data de emissão
 * no futuro. Comparação por partes de calendário (ano/mês/dia), não por
 * timestamp exato, para não rejeitar "hoje" por causa da hora do
 * pedido. Deliberadamente não aplicado a `DueDateExtractor` — datas de
 * vencimento futuras são o caso normal (pagamento a prazo).
 */
export function isFutureDate(date: Date): boolean {
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return date.getTime() > todayUtc;
}

/**
 * `true` se o ano de `date` está dentro da gama plausível (ver
 * `MIN_PLAUSIBLE_YEAR`/`MAX_PLAUSIBLE_YEARS_AHEAD`) — extraída de
 * `buildUtcDate` para ser reutilizável fora deste módulo. Achado real
 * (validação manual, Fase 6.8+): esta regra só existia aqui, no
 * caminho de extração fiscal (`parseFlexibleDate`); o caminho de
 * persistência do `InvoiceDraft` (`InvoiceDraftsService`, DTOs com
 * `@IsDateString()`) nunca a aplicava — um `PATCH` direto, ou uma
 * sugestão aplicada antes desta correção existir, podia gravar um ano
 * implausível (ex. 2096) sem qualquer validação. `InvoiceDraftsService`
 * importa esta função para fechar essa lacuna, em vez de duplicar os
 * limiares num segundo sítio.
 */
export function isPlausibleYear(date: Date): boolean {
  const year = date.getUTCFullYear();
  const maxPlausibleYear = new Date().getUTCFullYear() + MAX_PLAUSIBLE_YEARS_AHEAD;
  return year >= MIN_PLAUSIBLE_YEAR && year <= maxPlausibleYear;
}

function buildUtcDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  const isValid =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!isValid || !isPlausibleYear(date)) {
    return null;
  }
  return date;
}
