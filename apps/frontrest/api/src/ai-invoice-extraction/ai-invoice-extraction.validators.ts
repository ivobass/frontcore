/**
 * Validação decimal canónica (correção pós-revisão Codex, Fase 6.14) —
 * usada tanto por `parseAiInvoiceExtraction()` (fronteira estrutural da
 * resposta do provider) como por `invoice-extraction-merger.ts`
 * (comparação estrita, nunca `parseFloat` permissivo). Formato aceite:
 * sinal negativo opcional, um ou mais dígitos, opcionalmente um ponto
 * decimal seguido de um ou mais dígitos — nunca vírgula, notação
 * científica, `"NaN"`, `"Infinity"`, string vazia, ou múltiplos sinais.
 * Um único `"-"` inicial é aceite (faturas reais têm valores negativos
 * genuínos — descontos, notas de crédito, ex. `nota-de-credito.txt` nas
 * fixtures de regressão); nunca `"+"` (não pedido pelo prompt, nunca
 * observado em nenhum documento real da validação da Fase 6.14).
 */
const CANONICAL_DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;

export function isCanonicalDecimalString(value: string): boolean {
  return CANONICAL_DECIMAL_PATTERN.test(value);
}

/**
 * `precision`/`scale` seguem exatamente a convenção Prisma/Postgres
 * `@db.Decimal(precision, scale)` — `precision` é o total de dígitos
 * significativos, `scale` os dígitos depois da vírgula; a parte inteira
 * nunca pode exceder `precision - scale` dígitos. Só aceita uma string
 * já confirmada canónica — nunca tenta validar limites de algo
 * estruturalmente inválido (evita, por exemplo, `"abc".split('.')`
 * produzir um resultado enganador).
 */
export function isDecimalWithinPrismaLimits(value: string, precision: number, scale: number): boolean {
  if (!isCanonicalDecimalString(value)) return false;
  const unsigned = value.startsWith('-') ? value.slice(1) : value;
  const [integerPart, decimalPart = ''] = unsigned.split('.');
  const maxIntegerDigits = precision - scale;
  return integerPart.length <= maxIntegerDigits && decimalPart.length <= scale;
}

/**
 * Limites Prisma dos campos financeiros tocados por esta fase —
 * mantidos num único sítio para o parser e os pontos de persistência
 * nunca divergirem do schema real (`packages/database/prisma/schema.prisma`).
 * `headerAmount` (campos de cabeçalho de `AiInvoiceExtractionV1.totals`)
 * nunca é persistido diretamente numa coluna Decimal própria — usa o
 * mesmo limite de `InvoiceDraft.totalAmount` (Decimal(12,2)) só para
 * rejeitar strings claramente malformadas, nunca para impor uma
 * constraint de schema que não existe para estes campos específicos.
 */
export const DECIMAL_LIMITS = {
  quantity: { precision: 11, scale: 3 },
  unitPrice: { precision: 14, scale: 4 },
  vatRate: { precision: 5, scale: 2 },
  totalPrice: { precision: 12, scale: 2 },
  headerAmount: { precision: 12, scale: 2 },
} as const;

/**
 * Compara dois valores monetários/decimais — só concorda quando AMBOS
 * são strings canónicas válidas; nunca concorda por acidente com um
 * valor mal formado (correção pós-revisão Codex: a versão anterior
 * usava `Number.parseFloat` permissivo, que aceita prefixos parciais
 * como `"123.00abc"` → `123`). Tolerância pequena só para diferenças de
 * arredondamento genuínas entre as duas fontes, nunca para mascarar uma
 * string inválida.
 */
export function isDecimalEqual(a: string, b: string, tolerance = 0.005): boolean {
  if (!isCanonicalDecimalString(a) || !isCanonicalDecimalString(b)) return false;
  return Math.abs(Number.parseFloat(a) - Number.parseFloat(b)) < tolerance;
}

/** `position` (Fase 6.14) tem de ser um inteiro >= 1 — nunca `0`, negativo, fracionário ou `NaN`. */
export function isValidPosition(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

/**
 * Correção pós-revisão Codex (achado 3, ALTO — política de valores
 * negativos). `isCanonicalDecimalString()`/`isDecimalWithinPrismaLimits()`
 * continuam a reconhecer sintaticamente `"-5.00"` — a IA nunca deve
 * ficar impedida de EXTRAIR literalmente um valor negativo que exista
 * no documento (ex. uma nota de crédito). O que esta função acrescenta
 * é a regra SEMÂNTICA por campo: `quantity`/`unitPrice`/`vatRate`/
 * `totalPrice` de uma LINHA nunca podem ser negativos, porque o DTO
 * humano equivalente (`InvoiceDraftItemDto`, `apps/frontrest/api/src/invoices/drafts/dto/invoice-draft-item.dto.ts`)
 * já usa `@Min(0)` nesses quatro campos — a IA nunca deve conseguir
 * persistir, via `parseAiInvoiceExtraction()`, um valor que o
 * utilizador não poderia guardar manualmente através da mesma UI de
 * revisão. Os totais de CABEÇALHO (`AiInvoiceExtractionV1.totals` —
 * `subtotal`/`vatAmount`/`total`) NÃO passam por esta função — o DTO
 * humano equivalente (`UpdateInvoiceDraftDto.totalAmount`) não tem
 * `@Min`, precisamente porque descontos/notas de crédito genuínos já
 * são um caso real e aceite ao nível do cabeçalho (ver
 * `nota-de-credito.txt` nas fixtures de regressão da Fase 6.13); nunca
 * inventar aqui uma política contabilística nova que o resto do
 * domínio não tem.
 */
export function isNonNegativeDecimal(value: string): boolean {
  return isCanonicalDecimalString(value) && !value.startsWith('-');
}
