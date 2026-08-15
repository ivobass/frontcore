import { resolveStatusFilter } from './financial-filter.extractor';
import { splitComparisonPeriods } from './financial-period-pair.resolver';

/**
 * Resolução determinística da intenção financeira de uma mensagem do chat
 * (Fase 8.1, vocabulário alargado nas Fases 8.3/8.4) — regex/palavras-chave
 * sobre texto normalizado (minúsculas, sem acentos), nunca uma completion.
 * Conjunto fechado e tipado: uma mensagem produz no máximo uma intenção
 * suportada, ou `UNSUPPORTED` (nunca uma consulta livre/arbitrária).
 * Padrões de exclusão (escrita, detalhe de fatura) são verificados antes
 * dos de inclusão, para nunca classificar um pedido de alteração como
 * uma consulta válida. Comparação (`compara(r)?`/`versus`/`vs`, Fase 8.6)
 * é um caso à parte: só suportada quando a mensagem tem a forma exata de
 * dois períodos nomeados (`splitComparisonPeriods()`,
 * `financial-period-pair.resolver.ts`) — qualquer outra menção a
 * "comparar" (ex. entre fornecedores) continua `UNSUPPORTED`, fora do
 * âmbito desta fase.
 *
 * Fase 8.5 — responsabilidade estreitada só a decidir a **intenção**
 * (`FinancialIntentType`), nunca a transportar um filtro de estado no
 * seu retorno. A extração de um filtro de estado explícito
 * (`resolveStatusFilter()`, `financial-filter.extractor.ts`) é uma
 * responsabilidade separada e independente — este ficheiro reutiliza-a
 * só para decidir se uma mensagem sem nenhum outro sinal de intenção
 * merece o `intent` de fallback `FINANCIAL_SUMMARY`, nunca para expor o
 * valor do filtro. `FinancialRetrievalService` é quem lê o filtro,
 * sempre diretamente de `resolveStatusFilter()`, nunca a partir daqui —
 * ver `financial-retrieval.service.ts`.
 */
export type FinancialIntentType =
  | 'FINANCIAL_SUMMARY'
  | 'OUTSTANDING_BALANCE'
  | 'BY_STATUS'
  | 'BY_CATEGORY'
  | 'TOP_SUPPLIERS'
  | 'MONTHLY_TREND'
  | 'LARGEST_INVOICES'
  | 'PERIOD_COMPARISON';

export type FinancialIntentResolution =
  | { kind: 'SUPPORTED'; intent: FinancialIntentType }
  | { kind: 'UNSUPPORTED' };

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

// Hardening pós-revisão Codex — pergunta explicitamente pela
// identidade/número de uma fatura ("qual é o número da fatura?"/"qual é
// o número dessa fatura?"). Preposição "d[ae]"/"dess[ae]"/"dest[ae]"
// (nunca "de", que é sempre o sinal de contagem — "número DE faturas",
// `FINANCIAL_SUMMARY_PATTERN` acima) — nunca confundido com uma pergunta
// de contagem. Usada só por `FinancialRetrievalService.retrieve()`
// (caminho direto — a única via com acesso ao texto livre da pergunta
// atual) para decidir se `validateFinancialGrounding()`
// (`financial-grounding.validator.ts`) alarga a validação do número de
// fatura a menções sem o rótulo "número" — nunca aplicada
// indiscriminadamente a qualquer resposta financeira, para nunca
// confundir NIF, datas ou outras referências.
const INVOICE_IDENTITY_QUERY_PATTERN = /\bn[uú]mero\s+d(?:a|ess[ae]|est[ae])\s+fac?tura\b/;

export function requestsInvoiceIdentity(message: string): boolean {
  return INVOICE_IDENTITY_QUERY_PATTERN.test(normalize(message));
}

// Verificados primeiro — nunca deixar um pedido de escrita, detalhe de
// fatura ou comparação entre períodos cair num dos padrões de consulta
// abaixo só por coincidência lexical (ex. "aprova o pagamento deste mês").
const WRITE_ACTION_PATTERN =
  /\b(marca|marcar|aprova|aprovar|cria|criar|elimina|eliminar|apaga|apagar|atualiza|atualizar|regista|registar|altera|alterar|edita|editar)\b/;
// Hardening pós-validação manual — achado real: `\bnumero da fatura\b`
// excluía também "qual é o número da fatura paga?" (o utilizador a
// PEDIR o número, nunca a fornecer um para detalhe de uma fatura
// concreta) — as duas perguntas partilham as mesmas 3 palavras, só a
// intenção é oposta. Removido: as outras 3 alternativas já cobrem os
// casos genuínos de detalhe/lookup por número ("mostra a fatura",
// "detalhe da fatura", "fatura" + dígito explícito); uma pergunta
// "número da fatura" verdadeiramente ambígua (sem estado nem
// continuidade) continua UNSUPPORTED por simples ausência de padrão de
// inclusão correspondente — nunca precisou desta exclusão explícita.
const INVOICE_DETAIL_PATTERN =
  /\bmostra a fatura\b|\bdetalhe da fatura\b|\bfatura\s+(n[ºo°]?\s*)?\S*\d/;
const COMPARISON_PATTERN = /\bcompara(r)?\b|\bversus\b|\bvs\b/;

// Vocabulário alargado na Fase 8.3 — expandido diretamente sobre o
// regex existente (sem camada de normalização lexical nova, YAGNI face
// ao tamanho real da lacuna), a partir de perguntas reais que falhavam
// (ver docs/phases/phase-8.3-ai-tools-function-calling-foundation.md).
// "falta(m) pagar" — hardening pós-validação manual, achado real:
// "quanto falta pagar?" não reconhecida ("por pagar"/"a pagar" não
// aparecem como substring). Acrescentado ao mesmo padrão fechado, nunca
// uma heurística/intent separada.
const OUTSTANDING_PATTERN = /\bpor pagar\b|\bem divida\b|\ba pagar\b|\bfalta(?:m)? pagar\b|\bpendentes?\b/;
const BY_STATUS_PATTERN = /\bpor estado\b|\bcada estado\b|\bestados?\b.*\bfatura/;
// "onde gasto mais"/"maior despesa" — decisão de desenho explícita:
// mapeados para BY_CATEGORY (não TOP_SUPPLIERS) por "categoria" ser a
// dimensão de despesa mais comum nesta fraseação; TOP_SUPPLIERS continua
// a exigir a palavra "fornecedor" explicitamente.
const BY_CATEGORY_PATTERN =
  /\bcategorias?\b|\bonde (estou a gastar|gasto|gastamos)\b|\bmaior despesa\b/;
const TOP_SUPPLIERS_PATTERN = /\bfornecedor(es)?\b/;
const MONTHLY_TREND_PATTERN = /\bevolucao mensal\b|\bevolucao\b.*\bmensal\b/;
// "quantas faturas"/"faturas existem"/"numero de faturas" — contagem de
// faturas é parte de `totals` (FINANCIAL_SUMMARY), nunca uma intenção
// própria (sem novo tipo de dado a expor). "quanto gastamos" (Hardening
// pós-Fase 8.13) — só a 1ª pessoa do plural; `normalize()` já remove
// acentos, por isso "gastámos"/"gastamos" caem ambos aqui, sem precisar
// de duas entradas.
const FINANCIAL_SUMMARY_PATTERN =
  /\bquanto gastei\b|\bquanto gastamos\b|\bresumo financeiro\b|\bresumo\b|\btotal\b|\bquantas faturas\b|\bfaturas existem\b|\bnumero de faturas\b|\bmedia\b/;

// Hardening pós-Fase 8.13 — "faturas/facturas confirmadas/registadas/
// oficiais" referem-se sempre a `Invoice` (nunca `InvoiceDraft`); o
// próprio texto determinístico do sistema já usa "confirmadas"
// (`NO_INVOICES_LINE`, `financial-context.builder.ts`) — esta fase
// elimina a inconsistência de o utilizador usar a mesma palavra e o
// sistema não a reconhecer. Nunca introduz um estado novo: mapeia
// sempre para FINANCIAL_SUMMARY, reutilizando `totals` já existente.
// `fac?tura` cobre as duas grafias ("fatura"/"factura") sem duas
// entradas; "oficia(l|is)" cobre o plural irregular do português
// ("oficial" → "oficiais", nunca "oficials").
const CONFIRMED_OFFICIAL_INVOICES_PATTERN = /\bfac?tura(s)?\s+(confirmada(s)?|registada(s)?|oficia(l|is))\b/;

// Vocabulário novo na Fase 8.4 — "maiores despesas" é ambíguo por
// natureza (faturas individuais vs. fornecedor vs. categoria agregados,
// ver decisão registada em docs/phases/phase-8.4-*.md): só mapeado para
// LARGEST_INVOICES (o primitivo novo desta fase) quando a pergunta se
// refere explicitamente a faturas concretas — "maior despesa"/"maiores
// despesas" sozinho continua a cair em BY_CATEGORY (decisão já tomada na
// Fase 8.3, preservada), e uma menção explícita a "fornecedor" continua
// a cair em TOP_SUPPLIERS (`TOP_SUPPLIERS_PATTERN`, inalterado).
const LARGEST_INVOICES_PATTERN =
  /\bmaiores faturas\b|\bfatura(s)?\s+(de\s+)?maior valor\b|\bfatura(s)?\s+mais\s+car(a|as)\b|\bmaior fatura\b/;

export function resolveFinancialIntent(text: string): FinancialIntentResolution {
  const normalized = normalize(text);

  if (WRITE_ACTION_PATTERN.test(normalized) || INVOICE_DETAIL_PATTERN.test(normalized)) {
    return { kind: 'UNSUPPORTED' };
  }

  // Fase 8.6 — comparação explícita de dois períodos na mesma mensagem
  // ("compara maio com junho", "este mês versus o mês passado").
  // Checado antes de COMPARISON_PATTERN: só a forma sintática
  // reconhecida por `splitComparisonPeriods()` conta como suportada —
  // "compara os fornecedores" continua UNSUPPORTED (comparação de
  // entidades fica fora do âmbito, ver
  // docs/phases/phase-8.6-financial-period-comparison-foundation.md).
  if (splitComparisonPeriods(text) !== null) {
    return { kind: 'SUPPORTED', intent: 'PERIOD_COMPARISON' };
  }

  if (COMPARISON_PATTERN.test(normalized)) {
    return { kind: 'UNSUPPORTED' };
  }

  if (LARGEST_INVOICES_PATTERN.test(normalized)) {
    return { kind: 'SUPPORTED', intent: 'LARGEST_INVOICES' };
  }

  // Contagem/filtro por um único estado explícito (Fase 8.4, extração
  // movida para `financial-filter.extractor.ts` na Fase 8.5) — "quantas
  // faturas pagas"/"quantas vencidas"/"só as pendentes" (distintas entre
  // si, ao contrário de OUTSTANDING_BALANCE que combina Pendente+Vencida)
  // resolvem sempre para FINANCIAL_SUMMARY quando têm um sinal explícito
  // de filtro — checado antes de OUTSTANDING_PATTERN, para "só as
  // pendentes" nunca cair no combinado. Uma menção solta como "Existem
  // faturas pendentes?" (sem sinal) nunca corresponde aqui, continuando a
  // resolver via OUTSTANDING_PATTERN abaixo — preserva exatamente a
  // regressão real corrigida na Fase 8.3.
  if (resolveStatusFilter(text) !== undefined) {
    return { kind: 'SUPPORTED', intent: 'FINANCIAL_SUMMARY' };
  }

  if (OUTSTANDING_PATTERN.test(normalized)) return { kind: 'SUPPORTED', intent: 'OUTSTANDING_BALANCE' };
  if (BY_STATUS_PATTERN.test(normalized)) return { kind: 'SUPPORTED', intent: 'BY_STATUS' };
  if (BY_CATEGORY_PATTERN.test(normalized)) return { kind: 'SUPPORTED', intent: 'BY_CATEGORY' };
  if (TOP_SUPPLIERS_PATTERN.test(normalized)) return { kind: 'SUPPORTED', intent: 'TOP_SUPPLIERS' };
  if (MONTHLY_TREND_PATTERN.test(normalized)) return { kind: 'SUPPORTED', intent: 'MONTHLY_TREND' };
  if (CONFIRMED_OFFICIAL_INVOICES_PATTERN.test(normalized)) return { kind: 'SUPPORTED', intent: 'FINANCIAL_SUMMARY' };
  if (FINANCIAL_SUMMARY_PATTERN.test(normalized)) return { kind: 'SUPPORTED', intent: 'FINANCIAL_SUMMARY' };

  return { kind: 'UNSUPPORTED' };
}
