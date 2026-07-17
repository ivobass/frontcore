/**
 * Resolução determinística da intenção financeira de uma mensagem do chat
 * (Fase 8.1) — regex/palavras-chave sobre texto normalizado (minúsculas,
 * sem acentos), nunca uma completion. Conjunto fechado e tipado: uma
 * mensagem produz no máximo uma intenção suportada, ou `UNSUPPORTED`
 * (nunca uma consulta livre/arbitrária). Padrões de exclusão (escrita,
 * detalhe de fatura, comparação) são verificados antes dos de inclusão,
 * para nunca classificar um pedido de alteração como uma consulta válida.
 */
export type FinancialIntentType =
  | 'FINANCIAL_SUMMARY'
  | 'OUTSTANDING_BALANCE'
  | 'BY_STATUS'
  | 'BY_CATEGORY'
  | 'TOP_SUPPLIERS'
  | 'MONTHLY_TREND';

export type FinancialIntentResolution =
  | { kind: 'SUPPORTED'; intent: FinancialIntentType }
  | { kind: 'UNSUPPORTED' };

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Verificados primeiro — nunca deixar um pedido de escrita, detalhe de
// fatura ou comparação entre períodos cair num dos padrões de consulta
// abaixo só por coincidência lexical (ex. "aprova o pagamento deste mês").
const WRITE_ACTION_PATTERN =
  /\b(marca|marcar|aprova|aprovar|cria|criar|elimina|eliminar|apaga|apagar|atualiza|atualizar|regista|registar|altera|alterar|edita|editar)\b/;
const INVOICE_DETAIL_PATTERN =
  /\bmostra a fatura\b|\bdetalhe da fatura\b|\bnumero da fatura\b|\bfatura\s+(n[ºo°]?\s*)?\S*\d/;
const COMPARISON_PATTERN = /\bcompara(r)?\b|\bversus\b|\bvs\b/;

const OUTSTANDING_PATTERN = /\bpor pagar\b|\bem divida\b|\ba pagar\b/;
const BY_STATUS_PATTERN = /\bpor estado\b|\bcada estado\b|\bestados?\b.*\bfatura/;
const BY_CATEGORY_PATTERN = /\bcategorias?\b/;
const TOP_SUPPLIERS_PATTERN = /\bfornecedor(es)?\b/;
const MONTHLY_TREND_PATTERN = /\bevolucao mensal\b|\bevolucao\b.*\bmensal\b/;
const FINANCIAL_SUMMARY_PATTERN = /\bquanto gastei\b|\bresumo financeiro\b|\bresumo\b|\btotal\b/;

export function resolveFinancialIntent(text: string): FinancialIntentResolution {
  const normalized = normalize(text);

  if (
    WRITE_ACTION_PATTERN.test(normalized) ||
    INVOICE_DETAIL_PATTERN.test(normalized) ||
    COMPARISON_PATTERN.test(normalized)
  ) {
    return { kind: 'UNSUPPORTED' };
  }

  if (OUTSTANDING_PATTERN.test(normalized)) return { kind: 'SUPPORTED', intent: 'OUTSTANDING_BALANCE' };
  if (BY_STATUS_PATTERN.test(normalized)) return { kind: 'SUPPORTED', intent: 'BY_STATUS' };
  if (BY_CATEGORY_PATTERN.test(normalized)) return { kind: 'SUPPORTED', intent: 'BY_CATEGORY' };
  if (TOP_SUPPLIERS_PATTERN.test(normalized)) return { kind: 'SUPPORTED', intent: 'TOP_SUPPLIERS' };
  if (MONTHLY_TREND_PATTERN.test(normalized)) return { kind: 'SUPPORTED', intent: 'MONTHLY_TREND' };
  if (FINANCIAL_SUMMARY_PATTERN.test(normalized)) return { kind: 'SUPPORTED', intent: 'FINANCIAL_SUMMARY' };

  return { kind: 'UNSUPPORTED' };
}
