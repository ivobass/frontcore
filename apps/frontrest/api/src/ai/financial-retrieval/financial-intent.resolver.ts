import type { InvoiceStatus } from '@frontcore/database';

/**
 * Resolução determinística da intenção financeira de uma mensagem do chat
 * (Fase 8.1, vocabulário alargado nas Fases 8.3/8.4) — regex/palavras-chave
 * sobre texto normalizado (minúsculas, sem acentos), nunca uma completion.
 * Conjunto fechado e tipado: uma mensagem produz no máximo uma intenção
 * suportada, ou `UNSUPPORTED` (nunca uma consulta livre/arbitrária).
 * Padrões de exclusão (escrita, detalhe de fatura, comparação) são
 * verificados antes dos de inclusão, para nunca classificar um pedido de
 * alteração como uma consulta válida.
 */
export type FinancialIntentType =
  | 'FINANCIAL_SUMMARY'
  | 'OUTSTANDING_BALANCE'
  | 'BY_STATUS'
  | 'BY_CATEGORY'
  | 'TOP_SUPPLIERS'
  | 'MONTHLY_TREND'
  | 'LARGEST_INVOICES';

export type FinancialIntentResolution =
  | { kind: 'SUPPORTED'; intent: FinancialIntentType; statusFilter?: InvoiceStatus }
  | { kind: 'UNSUPPORTED' };

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

// Verificados primeiro — nunca deixar um pedido de escrita, detalhe de
// fatura ou comparação entre períodos cair num dos padrões de consulta
// abaixo só por coincidência lexical (ex. "aprova o pagamento deste mês").
const WRITE_ACTION_PATTERN =
  /\b(marca|marcar|aprova|aprovar|cria|criar|elimina|eliminar|apaga|apagar|atualiza|atualizar|regista|registar|altera|alterar|edita|editar)\b/;
const INVOICE_DETAIL_PATTERN =
  /\bmostra a fatura\b|\bdetalhe da fatura\b|\bnumero da fatura\b|\bfatura\s+(n[ºo°]?\s*)?\S*\d/;
const COMPARISON_PATTERN = /\bcompara(r)?\b|\bversus\b|\bvs\b/;

// Vocabulário alargado na Fase 8.3 — expandido diretamente sobre o
// regex existente (sem camada de normalização lexical nova, YAGNI face
// ao tamanho real da lacuna), a partir de perguntas reais que falhavam
// (ver docs/phases/phase-8.3-ai-tools-function-calling-foundation.md).
const OUTSTANDING_PATTERN = /\bpor pagar\b|\bem divida\b|\ba pagar\b|\bpendentes?\b/;
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
// própria (sem novo tipo de dado a expor).
const FINANCIAL_SUMMARY_PATTERN =
  /\bquanto gastei\b|\bresumo financeiro\b|\bresumo\b|\btotal\b|\bquantas faturas\b|\bfaturas existem\b|\bnumero de faturas\b|\bmedia\b/;

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

// Contagem/filtro por um único estado explícito (Fase 8.4) — "quantas
// faturas pagas"/"quantas vencidas"/"quantas pendentes" (distintas entre
// si, ao contrário de OUTSTANDING_BALANCE que combina Pendente+Vencida)
// e continuações como "Mostra apenas as vencidas.". Exige sempre um
// verbo de contagem/filtro antes do estado — nunca ativa para uma menção
// solta como "Existem faturas pendentes?" (sem "quantas"/"mostra"/...),
// que continua a resolver via OUTSTANDING_PATTERN (checado depois),
// preservando exatamente a regressão real corrigida na Fase 8.3.
const SPECIFIC_STATUS_PATTERN =
  /\b(?:quantas|quantos|numero de|conta(?:gem)?|mostra(?:r)?|lista(?:r)?)\b.*?\b(pendentes?|pagas?|pagos?|vencidas?|canceladas?)\b/;

const STATUS_WORD_TO_ENUM: Record<string, InvoiceStatus> = {
  pendente: 'PENDING',
  pendentes: 'PENDING',
  paga: 'PAID',
  pagas: 'PAID',
  pago: 'PAID',
  pagos: 'PAID',
  vencida: 'OVERDUE',
  vencidas: 'OVERDUE',
  cancelada: 'CANCELLED',
  canceladas: 'CANCELLED',
};

export function resolveFinancialIntent(text: string): FinancialIntentResolution {
  const normalized = normalize(text);

  if (
    WRITE_ACTION_PATTERN.test(normalized) ||
    INVOICE_DETAIL_PATTERN.test(normalized) ||
    COMPARISON_PATTERN.test(normalized)
  ) {
    return { kind: 'UNSUPPORTED' };
  }

  if (LARGEST_INVOICES_PATTERN.test(normalized)) {
    return { kind: 'SUPPORTED', intent: 'LARGEST_INVOICES' };
  }

  const specificStatusMatch = normalized.match(SPECIFIC_STATUS_PATTERN);
  if (specificStatusMatch) {
    const statusFilter = STATUS_WORD_TO_ENUM[specificStatusMatch[1]];
    return { kind: 'SUPPORTED', intent: 'FINANCIAL_SUMMARY', statusFilter };
  }

  if (OUTSTANDING_PATTERN.test(normalized)) return { kind: 'SUPPORTED', intent: 'OUTSTANDING_BALANCE' };
  if (BY_STATUS_PATTERN.test(normalized)) return { kind: 'SUPPORTED', intent: 'BY_STATUS' };
  if (BY_CATEGORY_PATTERN.test(normalized)) return { kind: 'SUPPORTED', intent: 'BY_CATEGORY' };
  if (TOP_SUPPLIERS_PATTERN.test(normalized)) return { kind: 'SUPPORTED', intent: 'TOP_SUPPLIERS' };
  if (MONTHLY_TREND_PATTERN.test(normalized)) return { kind: 'SUPPORTED', intent: 'MONTHLY_TREND' };
  if (FINANCIAL_SUMMARY_PATTERN.test(normalized)) return { kind: 'SUPPORTED', intent: 'FINANCIAL_SUMMARY' };

  return { kind: 'UNSUPPORTED' };
}
