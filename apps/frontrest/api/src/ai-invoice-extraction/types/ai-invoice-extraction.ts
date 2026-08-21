/**
 * Contrato explicitamente versionado da extração estruturada por IA de
 * uma fatura (Fase 6.14) — uma única chamada `AiCompletionProvider`
 * (`packages/ai`, `responseFormat`) por documento devolve isto,
 * validado estruturalmente (`parseAiInvoiceExtraction()`, neste
 * módulo) antes de qualquer uso; nunca confiado apenas por o pedido ter
 * pedido structured output. Decimais financeiros são sempre `string`
 * (nunca `number`) — mesma disciplina do resto do domínio financeiro
 * (`Prisma.Decimal.toJSON()`), evita perda de precisão e ambiguidade de
 * vírgula/ponto ao atravessar JSON. Campo ausente no documento = `null`
 * — nunca inventado, nunca `0`/`''` como substituto silencioso de
 * "não sei".
 */
export interface AiInvoiceExtractionV1 {
  schemaVersion: '1';

  supplier: {
    name: string | null;
    taxId: string | null;
  };

  invoice: {
    number: string | null;
    issueDate: string | null;
    dueDate: string | null;
    currency: string | null;
  };

  totals: {
    subtotal: string | null;
    vatAmount: string | null;
    total: string | null;
  };

  items: AiInvoiceLineV1[];
}

/** Uma linha da fatura — `position` preserva sempre a ordem do documento original, nunca reordenada por nenhum critério de valor. */
export interface AiInvoiceLineV1 {
  position: number;
  description: string;
  quantity: string | null;
  unit: string | null;
  unitPrice: string | null;
  vatRate: string | null;
  totalPrice: string | null;
}

export const AI_INVOICE_EXTRACTION_SCHEMA_VERSION = '1' as const;
