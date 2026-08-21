import type { AiInvoiceExtractionV1, AiInvoiceLineV1 } from './types/ai-invoice-extraction';
import {
  DECIMAL_LIMITS,
  isDecimalWithinPrismaLimits,
  isNonNegativeDecimal,
  isValidPosition,
} from './ai-invoice-extraction.validators';

/**
 * Fronteira ESTRUTURAL real da resposta do provider — correção
 * pós-revisão Codex: a versão anterior era demasiado permissiva
 * (campo obrigatório ausente → convertido para `null`; tipo errado →
 * convertido para `null`; propriedades extra → ignoradas; `position`
 * inválida → podia passar; decimal arbitrário como `"abc"` → podia
 * passar), contradizendo a promessa de "JSON Schema strict + parser
 * local como segunda fronteira independente". Regra única, sem
 * exceções: qualquer desvio face a `AiInvoiceExtractionV1` — chave
 * obrigatória AUSENTE (nunca confundida com a chave presente e igual a
 * `null` — `{"taxId": null}` é válido, ausência de `"taxId"` não é),
 * tipo errado, propriedade adicional não prevista, decimal fora do
 * formato canónico ou dos limites Prisma (`ai-invoice-extraction.validators.ts`),
 * `position` inválida/duplicada/fora de sequência, campo financeiro de
 * linha negativo — devolve `null` para a resposta INTEIRA, nunca um
 * valor parcialmente corrigido. O JSON Schema `strict` do provider
 * (`ai-invoice-extraction.schema.ts`) reduz a frequência de respostas
 * mal formadas; esta função é sempre a fronteira de confiança real,
 * independente do provider.
 *
 * Duas regras adicionais (correção pós-revisão Codex, 2ª ronda):
 * **achado 3** — `quantity`/`unitPrice`/`vatRate`/`totalPrice` de uma
 * LINHA nunca podem ser negativos (mesma regra de `InvoiceDraftItemDto`,
 * `@Min(0)`); os totais de CABEÇALHO continuam a aceitar negativo
 * (descontos/notas de crédito, mesma regra de
 * `UpdateInvoiceDraftDto.totalAmount`, sem `@Min`). **Achado 4** —
 * `position` tem de refletir exatamente a ordem do array (`items[i]
 * .position === i + 1`); `[1, 3]`, `[2, 1]` ou posições repetidas
 * invalidam a resposta inteira, nunca são silenciosamente reordenadas.
 */

/** Sentinela distinto de `null` — `null` é um valor de campo válido (ausência de dado no documento); `INVALID` marca uma violação estrutural que invalida a resposta inteira. Declarado `unique symbol` para o TypeScript estreitar corretamente cada `=== INVALID`. */
const INVALID: unique symbol = Symbol('invalid');
type Invalid = typeof INVALID;

export function parseAiInvoiceExtraction(raw: string): AiInvoiceExtractionV1 | null {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isPlainObject(body)) return null;
  if (!hasExactKeys(body, ['schemaVersion', 'supplier', 'invoice', 'totals', 'items'])) return null;
  if (body.schemaVersion !== '1') return null;

  const supplier = parseSupplier(body.supplier);
  if (!supplier) return null;

  const invoice = parseInvoiceHeader(body.invoice);
  if (!invoice) return null;

  const totals = parseTotals(body.totals);
  if (!totals) return null;

  if (!Array.isArray(body.items)) return null;
  const items = parseItems(body.items);
  if (!items) return null;

  return { schemaVersion: '1', supplier, invoice, totals, items };
}

function parseSupplier(raw: unknown): AiInvoiceExtractionV1['supplier'] | null {
  if (!isPlainObject(raw) || !hasExactKeys(raw, ['name', 'taxId'])) return null;

  const name = parseNullableString(raw, 'name');
  if (name === INVALID) return null;
  const taxId = parseNullableString(raw, 'taxId');
  if (taxId === INVALID) return null;

  return { name, taxId };
}

function parseInvoiceHeader(raw: unknown): AiInvoiceExtractionV1['invoice'] | null {
  if (!isPlainObject(raw) || !hasExactKeys(raw, ['number', 'issueDate', 'dueDate', 'currency'])) return null;

  const number = parseNullableString(raw, 'number');
  if (number === INVALID) return null;
  const issueDate = parseNullableString(raw, 'issueDate');
  if (issueDate === INVALID) return null;
  const dueDate = parseNullableString(raw, 'dueDate');
  if (dueDate === INVALID) return null;
  const currency = parseNullableString(raw, 'currency');
  if (currency === INVALID) return null;

  return { number, issueDate, dueDate, currency };
}

function parseTotals(raw: unknown): AiInvoiceExtractionV1['totals'] | null {
  if (!isPlainObject(raw) || !hasExactKeys(raw, ['subtotal', 'vatAmount', 'total'])) return null;

  const subtotal = parseNullableDecimal(raw, 'subtotal', DECIMAL_LIMITS.headerAmount);
  if (subtotal === INVALID) return null;
  const vatAmount = parseNullableDecimal(raw, 'vatAmount', DECIMAL_LIMITS.headerAmount);
  if (vatAmount === INVALID) return null;
  const total = parseNullableDecimal(raw, 'total', DECIMAL_LIMITS.headerAmount);
  if (total === INVALID) return null;

  return { subtotal, vatAmount, total };
}

/**
 * Correção pós-revisão Codex (achado 4, MÉDIO — `position` tem de
 * representar a ordem exata). A regra anterior só exigia
 * `position >= 1` e únicas — `[1, 3]`, `[2, 1]` ou `[1, 4, 7]` passavam,
 * contradizendo a promessa do contrato ("preservar a ordem das linhas
 * do documento", `types/ai-invoice-extraction.ts`). Regra final,
 * inequívoca: para um array com N linhas, `items[i].position` tem de
 * ser exatamente `i + 1` — nunca reordenar silenciosamente uma resposta
 * estruturalmente incoerente, rejeitar a resposta inteira em vez disso.
 * Esta igualdade estrita já garante, por construção, que `position` é
 * inteiro (`isValidPosition()`), `>= 1`, único e sequencial — não é
 * necessário nenhum `Set` de posições vistas.
 */
function parseItems(raw: unknown[]): AiInvoiceLineV1[] | null {
  const items: AiInvoiceLineV1[] = [];
  for (let index = 0; index < raw.length; index++) {
    const item = parseLine(raw[index]);
    if (!item) return null;
    if (item.position !== index + 1) return null;
    items.push(item);
  }
  return items;
}

/**
 * Campos financeiros de uma LINHA nunca podem ser negativos (achado 3
 * — `allowNegative: false`, mesma regra de `InvoiceDraftItemDto`,
 * `@Min(0)` em `quantity`/`unitPrice`/`vatRate`/`totalPrice`); os
 * totais de cabeçalho continuam a aceitar negativo por omissão (ver
 * `parseTotals()`, e o doc-comment de `isNonNegativeDecimal()`).
 */
function parseLine(raw: unknown): AiInvoiceLineV1 | null {
  if (!isPlainObject(raw)) return null;
  if (!hasExactKeys(raw, ['position', 'description', 'quantity', 'unit', 'unitPrice', 'vatRate', 'totalPrice'])) {
    return null;
  }
  if (!isValidPosition(raw.position)) return null;
  if (typeof raw.description !== 'string' || raw.description.trim().length === 0) return null;

  const quantity = parseNullableDecimal(raw, 'quantity', DECIMAL_LIMITS.quantity, false);
  if (quantity === INVALID) return null;
  const unit = parseNullableString(raw, 'unit');
  if (unit === INVALID) return null;
  const unitPrice = parseNullableDecimal(raw, 'unitPrice', DECIMAL_LIMITS.unitPrice, false);
  if (unitPrice === INVALID) return null;
  const vatRate = parseNullableDecimal(raw, 'vatRate', DECIMAL_LIMITS.vatRate, false);
  if (vatRate === INVALID) return null;
  const totalPrice = parseNullableDecimal(raw, 'totalPrice', DECIMAL_LIMITS.totalPrice, false);
  if (totalPrice === INVALID) return null;

  return { position: raw.position, description: raw.description, quantity, unit, unitPrice, vatRate, totalPrice };
}

/** `null` presente → `null` (válido, "sem dado"). String → devolvida tal e qual. Qualquer outro tipo (incl. chave ausente, já rejeitada por `hasExactKeys` antes de chegar aqui) → `INVALID`. */
function parseNullableString(obj: Record<string, unknown>, key: string): string | null | Invalid {
  const value = obj[key];
  if (value === null) return null;
  return typeof value === 'string' ? value : INVALID;
}

/**
 * Como `parseNullableString`, mas exige adicionalmente que uma string
 * presente seja um decimal canónico dentro dos limites Prisma do campo
 * — nunca aceita `"abc"`, `"1,25"`, `""`, `"NaN"`, `"Infinity"`, ou um
 * valor fora da precisão/escala da coluna. `allowNegative` (achado 3,
 * omissão `true`) — quando `false`, um valor sintaticamente válido mas
 * negativo (ex. `"-1.00"`) também invalida a resposta inteira; usado
 * pelos campos financeiros de LINHA (`parseLine()`), nunca pelos
 * totais de cabeçalho (`parseTotals()`).
 */
function parseNullableDecimal(
  obj: Record<string, unknown>,
  key: string,
  limits: { precision: number; scale: number },
  allowNegative = true,
): string | null | Invalid {
  const value = obj[key];
  if (value === null) return null;
  if (typeof value !== 'string') return INVALID;
  if (!isDecimalWithinPrismaLimits(value, limits.precision, limits.scale)) return INVALID;
  if (!allowNegative && !isNonNegativeDecimal(value)) return INVALID;
  return value;
}

/** Exige as chaves dadas — nem uma a mais, nem uma a menos. Distingue "chave ausente" (`in`) de "chave presente com valor `undefined`", ambas inválidas aqui (`AiInvoiceExtractionV1` nunca usa `undefined` como valor de campo, só `null`). */
function hasExactKeys(obj: Record<string, unknown>, keys: string[]): boolean {
  const objKeys = Object.keys(obj);
  if (objKeys.length !== keys.length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(obj, key));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
