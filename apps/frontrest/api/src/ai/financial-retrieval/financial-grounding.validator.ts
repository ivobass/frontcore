import { Prisma } from '@frontcore/database';
import type { FinancialIntentData, FinancialRetrievalResult } from './financial-retrieval.service';
import type { FinancialInsights } from '../../financial-insights/financial-insights.types';
import { computePaidAmount, sanitizeDomainText, translateStatus } from './financial-context.builder';

/**
 * Marcadores partilhados (Fase 8.8) para uma mensagem `ASSISTANT`
 * construída a partir de `buildFinancialContextMessage()` porque a
 * resposta real do provider falhou `validateFinancialGrounding()` —
 * usados tanto pelo caminho direto (`AiChatService`) como pelo caminho
 * de tool calling (`AiToolOrchestratorService`), única fonte de
 * verdade, nunca duas cópias divergentes. `provider` reutiliza o mesmo
 * valor `'deterministic'` do fallback "sem dados" (Fase 8.3) — ambos
 * significam "nunca confiado ao texto do LLM"; `model` é distinto
 * (`GROUNDING_FALLBACK_MODEL` vs. o `model` do fallback sem dados),
 * para uma auditoria conseguir distinguir a razão.
 */
export const GROUNDING_FALLBACK_PROVIDER = 'deterministic';
export const GROUNDING_FALLBACK_MODEL = 'financial-grounding-fallback';

export type FinancialGroundingFailureReason =
  | 'AMOUNT_NOT_ALLOWED'
  | 'COUNT_NOT_ALLOWED'
  | 'DATE_NOT_ALLOWED'
  | 'PERCENTAGE_NOT_ALLOWED'
  | 'INVOICE_NUMBER_NOT_ALLOWED'
  | 'CANCELLED_PAYMENT_CLAIM_NOT_ALLOWED'
  | 'MISSING_REQUIRED_STATUS'
  | 'MISSING_REQUIRED_SUPPLIER'
  | 'MISSING_REQUIRED_CATEGORY';

export type FinancialGroundingResult =
  | { grounded: true }
  | { grounded: false; reason: FinancialGroundingFailureReason };

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

// Valor monetário seguido de "€"/"EUR" — cobre pt-PT com separador de
// milhares "." ou espaço e decimal ",", o formato interno (ponto
// decimal, usado pelos dados estruturados), sinal negativo, e
// combinações dos dois (ex. "12.345.678,90 EUR"). Grupos de milhares
// exigem sempre exatamente 3 dígitos (`\d{3}`); o grupo decimal final,
// só 1-2 (nunca 3) — é esta diferença de comprimento que desambigua
// estruturalmente um separador de milhares de um separador decimal,
// sem precisar de adivinhar a partir do símbolo usado (nem "." nem ","
// têm um único significado fixo). `\d+` (sem limite superior) na parte
// inteira — nunca `\d{1,3}` — para um número sem nenhum separador de
// milhares (ex. "12345,67") nunca ser cortado a meio.
const AMOUNT_TOKEN_PATTERN = /(-?\d+(?:[ .,]\d{3})*(?:[.,]\d{1,2})?)\s*(?:€|eur\b)/gi;
// Contagem de faturas — só um número imediatamente antes de "fatura(s)".
const COUNT_TOKEN_PATTERN = /(\d+)\s*fatura(?:s)?\b/gi;
// Só datas em formato ISO (YYYY-MM-DD) — uma data em português corrido
// ("12 de julho de 2026") nunca é extraída nem validada aqui (ver
// "Limitações conhecidas" em `docs/phases/phase-8.8-*.md`).
const ISO_DATE_TOKEN_PATTERN = /\b\d{4}-\d{2}-\d{2}\b/g;
// Percentagem (Fase 8.9, Financial Insights) — sinal negativo opcional
// (ex. "-15%", tendência em queda), vírgula ou ponto decimal, 1-2 casas
// decimais. Normalizada sempre para o formato canónico (`toFixed(2)`,
// via Decimal) antes de comparar — nunca tolerância aproximada.
const PERCENTAGE_TOKEN_PATTERN = /(-?\d+(?:[.,]\d{1,2})?)\s*%/g;

// Um `Invoice.number` real pode ser composto por dois segmentos
// separados por um único espaço (achado real da revisão — ex. "ZFRC
// B036/9823519819", "FR U006/46931"); nunca mais que um espaço, para
// nunca capturar uma frase inteira em vez de um identificador. Cada
// segmento aceita `/`, `-`, `.` (mesmos separadores internos já
// aceites), nunca espaço dentro do próprio segmento. O candidato
// completo (`match[1]`) é sempre comparado tal e qual — nunca truncado
// a um só segmento — contra o conjunto grounded de `Invoice.number`.
// `NEGATIVE_LABEL_LOOKAHEAD`, repetido a cada posição do intervalo
// entre o rótulo e o candidato (nunca só na fronteira), impede o
// intervalo de "saltar por cima" de um rótulo de NIF/contribuinte/VAT
// para alcançar um dígito mais adiante — sem esta guarda, "a fatura tem
// NIF 509978142" capturaria "509978142" como se fosse número de fatura
// (falso positivo real, nunca alcançável só por limitar o comprimento
// do intervalo).
// `(?<![.,;:!?])` imediatamente antes do espaço opcional — achado real:
// sem esta guarda, um primeiro segmento terminado em "." (fim de frase,
// "." é um separador interno legítimo, sempre na classe) "colava-se" à
// primeira palavra da frase seguinte através do espaço entre frases
// (ex. "...é TEST-002. A fatura..." capturava "TEST-002. A" como um
// único candidato de 2 segmentos, nunca strippable pela remoção de
// pontuação final — só remove pontuação no FIM do candidato, nunca a
// meio). Nunca afeta um segmento real terminado em letra/dígito.
const IDENTIFIER_CANDIDATE_GROUP = '([a-z0-9][a-z0-9/.-]{0,24}(?:(?<![.,;:!?])[ \\t][a-z0-9][a-z0-9/.-]{0,24})?)';
const IDENTIFIER_HAS_DIGIT_LOOKAHEAD = '(?=[a-z0-9/.-]*(?:(?<![.,;:!?])[ \\t][a-z0-9/.-]*)?\\d)';
const NOT_TAX_LABEL_LOOKAHEAD = '(?!\\bnif\\b|\\bcontribuinte\\b|\\bvat\\b)';
// Guarda contra o efeito colateral real do suporte a identificadores
// compostos por espaço (2 segmentos, acima): sem esta exclusão, um nexo
// gramatical comum ("de", "da", "em"...) seguido de um valor com dígito
// mais adiante (ex. uma data, "fatura é DE 2026-08-10") seria ele
// próprio lido como o primeiro segmento do identificador — a mesma
// forma estrutural de "FR U006/46931" (um segmento sem dígito + espaço
// + um segmento com dígito), mas semanticamente nunca um identificador.
// Lista fechada de nexos/artigos curtos pt-PT — nunca colide com um
// segmento real de `Invoice.number` (sempre um código alfanumérico,
// nunca uma palavra do dicionário).
const NOT_CONNECTOR_WORD_LOOKAHEAD =
  '(?!(?:de|da|do|das|dos|em|no|na|nos|nas|um|uma|uns|umas|para|com|sem|por|que|e|foi|era|tem|seu|sua|deste|desta|neste|nesta|ao|aos)\\s)';

// Número de fatura mencionado explicitamente, rotulado por "número"/
// "número da fatura" (hardening pós-validação manual — achado real:
// "qual é o número da fatura paga?" respondia "não tenho essa
// informação", apesar de a `Invoice` ter número). Só cobre a forma
// rotulada — nunca qualquer token alfanumérico solto em qualquer ponto
// do texto (arriscaria falsos positivos em texto comum, mesmo
// vocabulário de risco já documentado para "número" solto num contexto
// não relacionado). Intervalo curto (até 10 caracteres) entre o rótulo
// e o candidato — cobre "número: X"/"número é X"/"número da fatura X",
// nunca uma frase inteira a meio; o intervalo nunca pode conter "NIF"/
// "contribuinte"/"VAT" (hardening pós-revisão Codex — "número de
// contribuinte" nunca é lido como pedido de `Invoice.number`). O
// candidato exige pelo menos um dígito (mesma disciplina de
// `CANDIDATE_HAS_DIGIT`, `invoice-number.extractor.ts`) — nunca aceita
// uma palavra comum (ex. "disponível") como se fosse um número. Sempre
// ativo, independentemente da pergunta atual.
const INVOICE_NUMBER_TOKEN_PATTERN = new RegExp(
  `\\bn[uú]mero(?:\\s+da\\s+fatura)?\\b(?:${NOT_TAX_LABEL_LOOKAHEAD}[^\\n]){0,10}?${NOT_TAX_LABEL_LOOKAHEAD}${NOT_CONNECTOR_WORD_LOOKAHEAD}${IDENTIFIER_HAS_DIGIT_LOOKAHEAD}${IDENTIFIER_CANDIDATE_GROUP}`,
  'gi',
);

// Hardening pós-revisão Codex — achado real: uma resposta fabricada sem
// o rótulo "número" (ex. "A fatura paga é XPTO-999.", "É a XPTO-999.")
// escapava ao `INVOICE_NUMBER_TOKEN_PATTERN` acima. Só ativo quando
// `result.invoiceIdentityRequested` é `true` — a pergunta ATUAL pediu
// explicitamente a identidade/número de uma fatura
// (`requestsInvoiceIdentity()`, `financial-intent.resolver.ts`) — nunca
// aplicado indiscriminadamente a qualquer resposta financeira, para
// nunca confundir NIF, datas ou outras referências mencionadas por
// coincidência perto da palavra "fatura" numa resposta sobre outra
// coisa. Duas formas: (1) "fatura ... <candidato>" — cobre "a fatura
// paga é X"/"trata-se da fatura X", intervalo curto (até 12 caracteres,
// mais apertado que o rótulo "número" acima, para nunca alcançar uma
// data ISO ou outro facto mencionado mais adiante na mesma frase),
// nunca contendo "NIF"/"contribuinte"/"VAT" (mesma guarda do rótulo
// "número" acima — ex. "a fatura tem NIF 509978142" nunca é lido como
// identidade de fatura); (2) resposta elíptica "é a/o <candidato>" como
// frase inteira (âncora `^...$`, com `m` — cobre "É a XPTO-999."
// sozinho, sem a palavra "fatura"). Candidatos com a forma exata de uma
// data ISO (`YYYY-MM-DD`) nunca são tratados como número de fatura —
// já validados à parte por `ISO_DATE_TOKEN_PATTERN`, nunca duas
// categorias a reivindicar o mesmo token.
const ISO_DATE_SHAPE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const INVOICE_IDENTITY_TOKEN_PATTERN = new RegExp(
  `\\bfac?tura\\b(?:${NOT_TAX_LABEL_LOOKAHEAD}[^\\n]){0,12}?${NOT_TAX_LABEL_LOOKAHEAD}${NOT_CONNECTOR_WORD_LOOKAHEAD}${IDENTIFIER_HAS_DIGIT_LOOKAHEAD}${IDENTIFIER_CANDIDATE_GROUP}|^\\s*[eEéÉ]\\s+(?:a|o)\\s+${IDENTIFIER_HAS_DIGIT_LOOKAHEAD}${IDENTIFIER_CANDIDATE_GROUP}\\s*\\.?\\s*$`,
  'gim',
);

// Hardening pós-revisão Codex — uma fatura CANCELLED nunca é PAID; uma
// resposta que associe semanticamente o conjunto cancelado a pagamento
// ("estão pagos"/"está pago"/"foi pago"/"foram pagos"/"pago"/"paga"/
// "liquidado(s)"/"liquidada(s)") é sempre rejeitada quando
// `filters.status === 'CANCELLED'`, independentemente de o valor
// numérico mencionado ser (ou não) um facto real (`totalAmount` é
// sempre um valor real, mesmo para CANCELLED — o problema nunca foi o
// número em si, mas o rótulo semântico aplicado a esse número). Nunca
// bloqueia a simples apresentação do valor cancelado (ex. "Faturas
// canceladas: 30,00 EUR."), que não contém nenhuma destas palavras.
// Aplicado só ao universo CANCELLED (`filters.status === 'CANCELLED'`)
// — nunca uma heurística global sobre "pago"/"paga" em qualquer
// resposta financeira, que teria falsos positivos óbvios (ex. "3
// faturas pagas este mês", sem filtro de estado).
const CANCELLED_PAYMENT_CLAIM_PATTERN = /\b(?:pag(?:o|a|os|as)|liquidad(?:o|a|os|as))\b/;

// Separador decimal final: sempre o ÚLTIMO "."/"," do número, seguido
// só de 1-2 dígitos até ao fim — nunca 3 (esses são sempre milhares,
// nunca decimais, nesta análise). `(.*)`` guloso (nunca `.*?`) para
// encontrar sempre o separador mais à direita que satisfaça esta forma
// — replica exatamente a mesma desambiguação estrutural já feita pelo
// próprio `AMOUNT_TOKEN_PATTERN` ao capturar o token.
const TRAILING_DECIMAL_PATTERN = /^(.*)[.,](\d{1,2})$/;

/**
 * `"354,00"`/`"354.00"`/`"1.234,56"`/`"1 234,56"`/`"12.345.678,90"`/
 * `"-1.234,56"` → sempre `"354.00"`/`"1234.56"`/`"-1234.56"` — mesmo
 * formato exato dos valores em `FinancialRetrievalResult`
 * (`Prisma.Decimal.toFixed(2)`, ponto decimal, sempre 2 casas, sinal só
 * quando negativo). Sinal preservado sempre à parte, nunca perdido na
 * normalização.
 */
function normalizeAmountToken(rawToken: string): string {
  const isNegative = rawToken.startsWith('-');
  const unsigned = isNegative ? rawToken.slice(1) : rawToken;

  const decimalMatch = unsigned.match(TRAILING_DECIMAL_PATTERN);
  const integerPart = decimalMatch ? decimalMatch[1] : unsigned;
  const fractionPart = decimalMatch ? decimalMatch[2] : '';

  // Remove separadores de milhares (".", "," ou espaço) — o que sobra é sempre só dígitos.
  const cleanedInteger = integerPart.replace(/[.,\s]/g, '');
  const paddedFraction = fractionPart.padEnd(2, '0').slice(0, 2);
  const sign = isNegative ? '-' : '';
  return `${sign}${cleanedInteger}.${paddedFraction}`;
}

/**
 * Normaliza uma percentagem apresentada em texto para o formato canónico
 * (Fase 8.9) — sempre via `Prisma.Decimal`, nunca `number` intermédio,
 * para nunca introduzir um erro de arredondamento na própria comparação.
 * `"60"`/`"60,00"`/`"60.00"` → sempre `"60.00"`; sinal preservado
 * (tendência em queda, ex. `"-15%"` → `"-15.00"`).
 */
function normalizePercentageToken(rawToken: string): string {
  return new Prisma.Decimal(rawToken.replace(',', '.')).toFixed(2);
}

interface AllowedFacts {
  amounts: Set<string>;
  counts: Set<number>;
  dates: Set<string>;
  /** Fase 8.9 — percentagens dos Financial Insights, sempre já normalizadas ao formato canónico (2 casas, `Decimal`). */
  percentages: Set<string>;
  /** Hardening pós-validação manual — números de fatura reais presentes nos dados (`Invoice.number`, sempre opcional); nunca inclui `null`. */
  invoiceNumbers: Set<string>;
}

/** Tipo estrutural mínimo (`current`/`previous`/`absoluteChange`, sempre string) — aceita `PeriodComparisonValue` (Fase 9) e `TrendComparison` (Fase 8.9), nunca precisa de `percentageChange`/`direction` aqui. */
function addComparisonAmounts(amounts: Set<string>, value: { current: string; previous: string; absoluteChange: string }): void {
  amounts.add(value.current);
  amounts.add(value.previous);
  amounts.add(value.absoluteChange);
}

/**
 * Regista todos os factos autorizados presentes num `FinancialInsights`
 * (Fase 8.9) — montantes/contagens/datas/percentagens, sempre lidos do
 * contrato tipado, nunca recalculados aqui. `share`/`percentageChange`
 * nulos (total zero, ou tendência com `insufficient_data`) nunca são
 * adicionados — nenhuma percentagem "null" pode aparecer em texto.
 */
function collectInsightFacts(
  insights: FinancialInsights,
  amounts: Set<string>,
  counts: Set<number>,
  dates: Set<string>,
  percentages: Set<string>,
  invoiceNumbers: Set<string>,
): void {
  for (const row of [insights.largestSupplier, insights.largestCategory]) {
    if (!row) continue;
    amounts.add(row.totalAmount);
    counts.add(row.count);
    if (row.share !== null) {
      percentages.add(row.share);
    }
  }
  if (insights.supplierConcentration.share !== null) {
    percentages.add(insights.supplierConcentration.share);
  }
  if (insights.categoryConcentration.share !== null) {
    percentages.add(insights.categoryConcentration.share);
  }
  amounts.add(insights.outstanding.totalAmount);
  counts.add(insights.outstanding.count);
  if (insights.largestExpense.invoice) {
    amounts.add(insights.largestExpense.invoice.totalAmount);
    dates.add(insights.largestExpense.invoice.issueDate);
    if (insights.largestExpense.invoice.number) {
      invoiceNumbers.add(insights.largestExpense.invoice.number.toUpperCase());
    }
  }
  if (insights.trend.comparison) {
    addComparisonAmounts(amounts, insights.trend.comparison);
    // `TrendComparison.percentageChange` já é string canónica (Fase 8.9,
    // correção pós-revisão) — nunca `number`, por isso nunca precisa de
    // passar por `Prisma.Decimal` aqui, ao contrário do PERIOD_COMPARISON abaixo.
    if (insights.trend.comparison.percentageChange !== null) {
      percentages.add(insights.trend.comparison.percentageChange);
    }
  }
}

/**
 * Extrai o conjunto fechado de factos "permitidos" diretamente do
 * `FinancialRetrievalResult` já resolvido — nunca reanalisa texto,
 * nunca chama o LLM. Cobre todas as variantes de `FinancialIntentData`
 * (Fases 8.1–8.6); qualquer valor/contagem/data que apareça na resposta
 * final e não esteja neste conjunto é, por definição, um valor que os
 * dados estruturados desta fase nunca continham.
 */
function collectAllowedFacts(result: Extract<FinancialRetrievalResult, { kind: 'DATA' }>): AllowedFacts {
  const amounts = new Set<string>();
  const counts = new Set<number>();
  const dates = new Set<string>([result.period.from, result.period.to]);
  const percentages = new Set<string>();
  const invoiceNumbers = new Set<string>();

  const data: FinancialIntentData = result.data;
  switch (data.intent) {
    case 'FINANCIAL_SUMMARY': {
      // `data.analysis` (Fase 8.10/8.13, Financial Analysis Engine) nunca
      // precisa de uma coleta própria aqui: por desenho, a evidência de
      // `monthlyTrendAnalysis`/`relativeConcentrationAnalysis` é sempre uma
      // cópia verbatim de campos já presentes em `insights` (`trend.
      // comparison`, `supplierConcentration.share`, `categoryConcentration.
      // share`) — `collectInsightFacts()`, abaixo, já autoriza qualquer
      // valor/percentagem que `analysis` possa introduzir. Reavaliar (YAGNI)
      // apenas se uma análise futura produzir evidência que não seja um
      // subconjunto de `insights`.
      const { totals, insights } = data;
      amounts.add(totals.totalAmount);
      amounts.add(totals.averageAmount);
      // Hardening pós-Fase 8.13 — "Foram registados X EUR... Deste valor, Y
      // EUR estão pagos" (`financial-context.builder.ts`); `paidAmount` é
      // sempre derivado de `totals.totalAmount`/`insights.outstanding`, nunca
      // uma nova fonte de dados — reutiliza exatamente a mesma fórmula
      // (`computePaidAmount()`), nunca uma segunda cópia divergente.
      // Hardening pós-revisão Codex — nunca autorizado quando
      // `filters.status === 'CANCELLED'`: a fórmula não é semanticamente
      // válida para esse universo (uma fatura cancelada nunca é "paga"),
      // e `buildFinancialContextMessage()` já deixou de a apresentar
      // nesse caso — nunca autorizar aqui o que o texto determinístico já
      // não mostra.
      if (result.filters.status !== 'CANCELLED') {
        amounts.add(computePaidAmount(totals.totalAmount, insights));
      }
      counts.add(totals.invoiceCount);
      counts.add(totals.activeInvoiceCount);
      counts.add(totals.cancelledInvoiceCount);
      collectInsightFacts(insights, amounts, counts, dates, percentages, invoiceNumbers);
      break;
    }
    case 'OUTSTANDING_BALANCE': {
      amounts.add(data.outstandingAmount);
      counts.add(data.outstandingCount);
      break;
    }
    case 'BY_STATUS': {
      for (const row of data.byStatus) {
        amounts.add(row.totalAmount);
        counts.add(row.count);
      }
      break;
    }
    case 'BY_CATEGORY': {
      for (const row of data.byCategory) {
        amounts.add(row.totalAmount);
        counts.add(row.count);
      }
      break;
    }
    case 'TOP_SUPPLIERS': {
      for (const row of data.topSuppliers) {
        amounts.add(row.totalAmount);
        counts.add(row.count);
      }
      break;
    }
    case 'MONTHLY_TREND': {
      for (const row of data.monthlyTrend) {
        amounts.add(row.totalAmount);
        counts.add(row.count);
      }
      break;
    }
    case 'LARGEST_INVOICES': {
      for (const invoice of data.invoices) {
        amounts.add(invoice.totalAmount);
        dates.add(invoice.issueDate);
        if (invoice.number) {
          invoiceNumbers.add(invoice.number.toUpperCase());
        }
      }
      break;
    }
    case 'PERIOD_COMPARISON': {
      const { current, previous, comparison } = data;
      for (const totals of [current.totals, previous.totals]) {
        amounts.add(totals.totalAmount);
        amounts.add(totals.averageAmount);
        counts.add(totals.invoiceCount);
        counts.add(totals.activeInvoiceCount);
        counts.add(totals.cancelledInvoiceCount);
      }
      dates.add(current.period.from);
      dates.add(current.period.to);
      dates.add(previous.period.from);
      dates.add(previous.period.to);
      addComparisonAmounts(amounts, comparison.totalAmount);
      // `comparison.activeInvoiceCount` é uma contagem representada como
      // string (`PeriodComparisonValue`), nunca um valor em EUR — fora do
      // conjunto `amounts` de propósito, nunca validada aqui.
      // Correção pós-revisão (Fase 8.9): as duas percentagens reais desta
      // comparação (`percentageChange`, sempre `number` aqui —
      // `PeriodComparisonValue`, Fase 9, nunca alterado) tinham ficado de
      // fora do conjunto permitido — qualquer resposta que mencionasse a
      // percentagem real (ex. "100%") era incorretamente rejeitada assim
      // que a Fase 8.9 passou a validar percentagens em texto.
      for (const value of [comparison.totalAmount.percentageChange, comparison.activeInvoiceCount.percentageChange]) {
        if (value !== null) {
          percentages.add(new Prisma.Decimal(value).toFixed(2));
        }
      }
      break;
    }
  }

  return { amounts, counts, dates, percentages, invoiceNumbers };
}

/**
 * Fronteira determinística (Fase 8.8, Strict Grounding) entre o
 * `FinancialRetrievalResult` real e a resposta final de texto livre do
 * provider — nunca usa o LLM para validar o próprio LLM. Falha
 * (`grounded: false`) quando a resposta contém:
 *
 * - um valor monetário (`€`/`EUR`) que não é nenhum dos valores reais
 *   dos dados estruturados (`AMOUNT_NOT_ALLOWED`);
 * - uma contagem de faturas (`N fatura(s)`) que não é nenhuma das
 *   contagens reais (`COUNT_NOT_ALLOWED`);
 * - uma data ISO (`YYYY-MM-DD`) que não é nenhuma das datas reais —
 *   período consultado, período de comparação, ou data de fatura em
 *   `LARGEST_INVOICES` (`DATE_NOT_ALLOWED`);
 * - uma percentagem (`N%`, Fase 8.9 — Financial Insights) que não
 *   corresponde a nenhum `share`/`percentageChange` real, depois de
 *   normalizada ao formato canónico (vírgula ou ponto decimal
 *   aceites na entrada, comparação sempre exata, sem tolerâncias
 *   aproximadas nem arredondamentos diferentes do valor autorizado)
 *   (`PERCENTAGE_NOT_ALLOWED`);
 * - um número de fatura rotulado explicitamente ("número"/"número da
 *   fatura", hardening pós-validação manual) que não corresponde a
 *   nenhum `Invoice.number` real presente nos dados
 *   (`INVOICE_NUMBER_NOT_ALLOWED`);
 * - quando `result.invoiceIdentityRequested` é `true` (a pergunta atual
 *   pediu explicitamente a identidade/número de uma fatura, hardening
 *   pós-revisão Codex), um identificador apresentado como número/
 *   identidade da fatura mesmo sem o rótulo "número" ("a fatura paga é
 *   X"/"trata-se da fatura X"/resposta elíptica "É a X.") que não
 *   corresponde a nenhum `Invoice.number` real — mesma razão
 *   (`INVOICE_NUMBER_NOT_ALLOWED`), nunca aplicado quando a pergunta
 *   atual não é sobre identidade de fatura;
 * - quando `result.filters.status === 'CANCELLED'` (hardening
 *   pós-revisão Codex), uma associação semântica entre o conjunto
 *   cancelado e pagamento ("estão pagos"/"está pago"/"foi pago"/
 *   "pago"/"paga"/"liquidado(s)"/"liquidada(s)") — uma fatura CANCELLED
 *   nunca é PAID, mesmo quando o valor numérico mencionado é, ele
 *   próprio, um facto real (`totalAmount`) (`CANCELLED_PAYMENT_CLAIM_NOT_ALLOWED`);
 * - quando `result.filters.status`/`supplierName`/`categoryName` está
 *   definido (a pergunta é sobre uma entidade/estado nomeado
 *   específico), e a resposta não menciona sequer esse nome/estado
 *   real — sinal de substituição (o nome/estado real foi trocado por
 *   outro, nunca omitido sem razão) (`MISSING_REQUIRED_STATUS`/
 *   `MISSING_REQUIRED_SUPPLIER`/`MISSING_REQUIRED_CATEGORY`).
 *
 * Nunca valida (por desenho, documentado como limitação): números por
 * extenso, datas em português corrido, nomes de fornecedor/categoria
 * mencionados sem filtro explícito (ex. numa lista de "principais
 * fornecedores" sem `filters.supplierName`), qualquer alegação
 * puramente qualitativa sem número/data/nome associado, ou — quando a
 * pergunta atual não pede a identidade de uma fatura
 * (`invoiceIdentityRequested: false`) — um número de fatura mencionado
 * sem o rótulo "número"/"número da fatura" a anunciá-lo explicitamente.
 */
export function validateFinancialGrounding(
  content: string,
  result: Extract<FinancialRetrievalResult, { kind: 'DATA' }>,
): FinancialGroundingResult {
  const { amounts, counts, dates, percentages, invoiceNumbers } = collectAllowedFacts(result);

  for (const match of content.matchAll(AMOUNT_TOKEN_PATTERN)) {
    if (!amounts.has(normalizeAmountToken(match[1]))) {
      return { grounded: false, reason: 'AMOUNT_NOT_ALLOWED' };
    }
  }

  for (const match of content.matchAll(COUNT_TOKEN_PATTERN)) {
    if (!counts.has(Number(match[1]))) {
      return { grounded: false, reason: 'COUNT_NOT_ALLOWED' };
    }
  }

  for (const match of content.matchAll(ISO_DATE_TOKEN_PATTERN)) {
    if (!dates.has(match[0])) {
      return { grounded: false, reason: 'DATE_NOT_ALLOWED' };
    }
  }

  for (const match of content.matchAll(PERCENTAGE_TOKEN_PATTERN)) {
    if (!percentages.has(normalizePercentageToken(match[1]))) {
      return { grounded: false, reason: 'PERCENTAGE_NOT_ALLOWED' };
    }
  }

  for (const match of content.matchAll(INVOICE_NUMBER_TOKEN_PATTERN)) {
    // Maiúsculas/minúsculas nunca distinguem — o mesmo número pode ser
    // parafraseado pelo provider com um caso diferente do original.
    const candidate = match[1].replace(/[.,;:!?]+$/, '').toUpperCase();
    if (!invoiceNumbers.has(candidate)) {
      return { grounded: false, reason: 'INVOICE_NUMBER_NOT_ALLOWED' };
    }
  }

  // Hardening pós-revisão Codex — só quando a pergunta atual pediu
  // explicitamente a identidade/número de uma fatura; nunca aplicado a
  // qualquer resposta financeira (evita confundir NIF/datas/outras
  // referências mencionadas por coincidência perto de "fatura").
  if (result.invoiceIdentityRequested) {
    for (const match of content.matchAll(INVOICE_IDENTITY_TOKEN_PATTERN)) {
      const rawCandidate = match[1] ?? match[2];
      if (!rawCandidate) continue;
      const candidate = rawCandidate.replace(/[.,;:!?]+$/, '');
      if (ISO_DATE_SHAPE_PATTERN.test(candidate)) continue;
      if (!invoiceNumbers.has(candidate.toUpperCase())) {
        return { grounded: false, reason: 'INVOICE_NUMBER_NOT_ALLOWED' };
      }
    }
  }

  const normalizedContent = normalize(content);
  const { filters } = result;

  // Hardening pós-revisão Codex — nível semântico mínimo: uma fatura
  // CANCELLED nunca é PAID, independentemente de o valor numérico
  // mencionado ser (ou não) um facto real (`totalAmount` continua
  // sempre autorizado, mesmo para CANCELLED — ver `collectAllowedFacts`).
  // Nunca bloqueia a simples apresentação do valor cancelado (nenhuma
  // destas palavras aparece em "Faturas canceladas: 30,00 EUR.").
  if (filters.status === 'CANCELLED' && CANCELLED_PAYMENT_CLAIM_PATTERN.test(normalizedContent)) {
    return { grounded: false, reason: 'CANCELLED_PAYMENT_CLAIM_NOT_ALLOWED' };
  }

  if (filters.status && !normalizedContent.includes(normalize(translateStatus(filters.status)))) {
    return { grounded: false, reason: 'MISSING_REQUIRED_STATUS' };
  }
  if (filters.supplierName && !normalizedContent.includes(normalize(sanitizeDomainText(filters.supplierName)))) {
    return { grounded: false, reason: 'MISSING_REQUIRED_SUPPLIER' };
  }
  if (filters.categoryName && !normalizedContent.includes(normalize(sanitizeDomainText(filters.categoryName)))) {
    return { grounded: false, reason: 'MISSING_REQUIRED_CATEGORY' };
  }

  return { grounded: true };
}
