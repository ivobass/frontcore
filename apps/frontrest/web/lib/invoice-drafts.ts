import { API_URL, authHeaders, authJsonHeaders, buildQuery, parseJsonOrThrow } from './api';
import type { Paginated } from './api';
import type { Invoice, InvoiceCategoryRef, InvoiceSupplierRef } from './invoices';

export type { Paginated } from './api';

/** Espelha o enum `OcrStatus` de `@frontcore/database` (package backend-only). */
export type OcrStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface InvoiceDraftStorageObjectRef {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: string;
}

/**
 * Forma HTTP consumida pelo frontend — não o objeto Prisma devolvido
 * incidentalmente pelo `include: { supplier: true, category: true }` da
 * API (esse inclui todos os campos de `Supplier`/`ExpenseCategory`).
 * `supplier`/`category` reutilizam os tipos-referência já definidos em
 * `lib/invoices.ts` (`{ id, name }`) em vez de duplicar essa forma.
 */
/** Linha de staging (Fase 6.14) — antes de `InvoiceItem`. Todos os campos exceto `description` são opcionais, refletindo o que a extração conseguiu determinar. */
export interface InvoiceDraftItem {
  id: string;
  position: number;
  description: string;
  quantity: string | null;
  unit: string | null;
  unitPrice: string | null;
  vatRate: string | null;
  totalPrice: string | null;
}

export interface InvoiceDraft {
  id: string;
  supplierId: string | null;
  categoryId: string | null;
  number: string | null;
  issueDate: string | null;
  dueDate: string | null;
  totalAmount: string | null;
  notes: string | null;
  ocrText: string | null;
  ocrConfidence: number | null;
  ocrStatus: OcrStatus;
  ocrError: string | null;
  /** Fase 6.14 — `true` a partir da primeira vez que o utilizador guarda as linhas explicitamente; a partir daí, uma extração de IA nunca as volta a substituir automaticamente. */
  itemsReviewedByHuman: boolean;
  createdAt: string;
  updatedAt: string;
  supplier: InvoiceSupplierRef | null;
  category: InvoiceCategoryRef | null;
  storageObject: InvoiceDraftStorageObjectRef;
  items: InvoiceDraftItem[];
}

export interface ListInvoiceDraftsParams {
  page?: number;
  pageSize?: number;
  supplierId?: string;
}

export interface CreateInvoiceDraftInput {
  storageObjectId: string;
}

/**
 * `undefined` (campo ausente) → não altera; `null` → limpa; valor →
 * atualiza — mesma distinção de `UpdateInvoiceDraftDto`
 * (`apps/frontrest/api`, Fase 6.8). O chamador só deve incluir as
 * chaves que mudaram face ao valor guardado.
 */
export interface UpdateInvoiceDraftInput {
  supplierId?: string | null;
  categoryId?: string | null;
  number?: string | null;
  issueDate?: string | null;
  dueDate?: string | null;
  totalAmount?: number | null;
  notes?: string | null;
}

/** Um único match do pipeline de parsing fiscal — valor, confiança, origem. */
export interface FiscalMatch<T> {
  value: T;
  confidence: number;
  source?: string;
}

/**
 * Só o subconjunto de `FiscalExtractionResult` (Fase 6.6/6.7) que esta
 * fase apresenta como sugestão — sem `customer`/`vat`/`currency`/
 * `metadata`, que não têm campo correspondente no formulário do draft
 * (ver "Fora do âmbito" da Fase 6.8).
 */
export interface DraftFiscalSuggestions {
  supplier: FiscalMatch<{ name: string }> | null;
  supplierTaxId: FiscalMatch<string> | null;
  invoice: {
    number: FiscalMatch<string> | null;
    /** ISO string na resposta HTTP — o `Date` do backend é serializado em JSON. */
    issueDate: FiscalMatch<string> | null;
    dueDate: FiscalMatch<string> | null;
  };
  totals: FiscalMatch<{ totalAmount: number }> | null;
  confidence: number;
}

export async function listInvoiceDrafts(
  accessToken: string,
  params: ListInvoiceDraftsParams = {},
): Promise<Paginated<InvoiceDraft>> {
  const response = await fetch(`${API_URL}/invoices/drafts${buildQuery(params)}`, {
    headers: authHeaders(accessToken),
  });
  return parseJsonOrThrow(response);
}

export async function getInvoiceDraft(
  accessToken: string,
  id: string,
): Promise<InvoiceDraft> {
  const response = await fetch(`${API_URL}/invoices/drafts/${id}`, {
    headers: authHeaders(accessToken),
  });
  return parseJsonOrThrow(response);
}

export async function createInvoiceDraft(
  accessToken: string,
  input: CreateInvoiceDraftInput,
): Promise<InvoiceDraft> {
  const response = await fetch(`${API_URL}/invoices/drafts`, {
    method: 'POST',
    headers: authJsonHeaders(accessToken),
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow(response);
}

export async function updateInvoiceDraft(
  accessToken: string,
  id: string,
  input: UpdateInvoiceDraftInput,
): Promise<InvoiceDraft> {
  const response = await fetch(`${API_URL}/invoices/drafts/${id}`, {
    method: 'PATCH',
    headers: authJsonHeaders(accessToken),
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow(response);
}

export async function deleteInvoiceDraft(
  accessToken: string,
  id: string,
): Promise<void> {
  const response = await fetch(`${API_URL}/invoices/drafts/${id}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
  await parseJsonOrThrow(response);
}

export async function getInvoiceDraftFiscalSuggestions(
  accessToken: string,
  id: string,
): Promise<DraftFiscalSuggestions> {
  const response = await fetch(`${API_URL}/invoices/drafts/${id}/fiscal-parsing`, {
    headers: authHeaders(accessToken),
  });
  return parseJsonOrThrow(response);
}

/**
 * Forma completa de `FiscalExtractionResult` (`apps/frontrest/api`,
 * `fiscal-parsing/types`) — ao contrário de `DraftFiscalSuggestions`
 * (subconjunto para o formulário de revisão), inclui `customer`/`vat`/
 * `currency`/`metadata`, necessários para a ferramenta de diagnóstico
 * do pipeline (Fase 6.8+): ver todos os campos que o parser encontrou
 * — não só os que têm campo correspondente no formulário.
 */
export interface FiscalExtractionResult {
  supplier: FiscalMatch<{ name: string }> | null;
  supplierTaxId: FiscalMatch<string> | null;
  customer: FiscalMatch<{ name: string }> | null;
  invoice: {
    number: FiscalMatch<string> | null;
    issueDate: FiscalMatch<string> | null;
    dueDate: FiscalMatch<string> | null;
    currency: FiscalMatch<string> | null;
  };
  totals: FiscalMatch<{ totalAmount: number }> | null;
  vat: FiscalMatch<{ rate?: number; amount?: number }> | null;
  confidence: number;
  metadata: {
    extractorsRun: string[];
    fieldsFound: string[];
    processingTimeMs: number;
    textLength: number;
    /** Candidatos rejeitados com motivo (Fase 6.8+, "false positive hardening") — diagnóstico puro, nunca afeta os campos acima. */
    rejectedCandidates: Array<{ field: string; candidate: string; reason: string }>;
  };
}

/**
 * Mesmo endpoint de `getInvoiceDraftFiscalSuggestions()` — a API já
 * devolve o `FiscalExtractionResult` completo, `DraftFiscalSuggestions`
 * é só um subconjunto tipado do lado do frontend. Uma segunda função
 * (em vez de alargar o tipo de retorno da existente) para nunca alterar
 * o que a folha de revisão já consome — só a ferramenta de diagnóstico
 * usa esta.
 */
export async function getFiscalExtractionDebug(
  accessToken: string,
  id: string,
): Promise<FiscalExtractionResult> {
  const response = await fetch(`${API_URL}/invoices/drafts/${id}/fiscal-parsing`, {
    headers: authHeaders(accessToken),
  });
  return parseJsonOrThrow(response);
}

/** Devolve a `Invoice` promovida — mesma forma de `getInvoice`/`listInvoices` (`lib/invoices.ts`), reutilizada em vez de duplicada. */
export async function promoteInvoiceDraft(
  accessToken: string,
  id: string,
): Promise<Invoice> {
  const response = await fetch(`${API_URL}/invoices/drafts/${id}/promote`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
  return parseJsonOrThrow(response);
}

/**
 * Estado da reconciliação de um campo entre o parsing determinístico e a
 * extração por IA (Fase 6.14, `InvoiceExtractionMerger` no backend) —
 * espelha `ReconciliationStatus`/`ReconciledField<T>`
 * (`apps/frontrest/api/src/ai-invoice-extraction/invoice-extraction-merger.ts`).
 * `suggestedValue` nunca está definido (`null`) num `'conflict'` — as
 * duas fontes discordam e nenhuma é escolhida automaticamente; a UI deve
 * sempre mostrar `deterministicValue`/`aiValue` lado a lado nesse caso.
 */
export type ReconciliationStatus = 'agreement' | 'conflict' | 'deterministic_only' | 'ai_only' | 'empty' | 'manual';

export interface ReconciledField<T> {
  status: ReconciliationStatus;
  deterministicValue: T | null;
  aiValue: T | null;
  suggestedValue: T | null;
}

/** Linha sugerida pela extração de IA — antes de ser persistida como `InvoiceDraftItem`. */
export interface AiInvoiceLine {
  position: number;
  description: string;
  quantity: string | null;
  unit: string | null;
  unitPrice: string | null;
  vatRate: string | null;
  totalPrice: string | null;
}

export interface InvoiceExtractionReconciliation {
  supplierName: ReconciledField<string>;
  supplierTaxId: ReconciledField<string>;
  invoiceNumber: ReconciledField<string>;
  issueDate: ReconciledField<string>;
  dueDate: ReconciledField<string>;
  currency: ReconciledField<string>;
  subtotal: ReconciledField<string>;
  vatAmount: ReconciledField<string>;
  total: ReconciledField<string>;
  items: AiInvoiceLine[];
}

export interface RunAiExtractionResult {
  reconciliation: InvoiceExtractionReconciliation;
  /** `true` quando as linhas sugeridas pela IA foram efetivamente persistidas (`itemsReviewedByHuman` ainda era `false`) — `false` nunca significa erro, só que a IA não tinha nada de novo para escrever ou que as linhas já tinham sido revistas manualmente. */
  itemsPersisted: boolean;
  items: InvoiceDraftItem[];
}

/**
 * Fase 6.14 — corre o parsing fiscal determinístico + a extração por IA
 * (`AiInvoiceExtractor`, uma única chamada estruturada ao provider
 * configurado) e reconcilia os dois. Mutação (pode persistir
 * `InvoiceDraftItem`, ver `itemsPersisted`) — nunca chamado
 * automaticamente pela UI, só por uma ação explícita ("Analisar com IA").
 */
export async function runAiInvoiceExtraction(
  accessToken: string,
  id: string,
): Promise<RunAiExtractionResult> {
  const response = await fetch(`${API_URL}/invoices/drafts/${id}/ai-extraction`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
  return parseJsonOrThrow(response);
}

export interface InvoiceDraftItemInput {
  position?: number;
  description: string;
  quantity?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  vatRate?: number | null;
  totalPrice?: number | null;
}

/**
 * Substituição integral das linhas do rascunho (editar/adicionar/
 * eliminar/reordenar — tudo através do array completo, nunca um PATCH
 * incremental por linha). Marca sempre `itemsReviewedByHuman = true` no
 * backend — a partir desta chamada, uma extração de IA seguinte nunca
 * mais substitui as linhas automaticamente.
 */
export async function replaceInvoiceDraftItems(
  accessToken: string,
  id: string,
  items: InvoiceDraftItemInput[],
): Promise<InvoiceDraftItem[]> {
  const response = await fetch(`${API_URL}/invoices/drafts/${id}/items`, {
    method: 'PUT',
    headers: authJsonHeaders(accessToken),
    body: JSON.stringify({ items }),
  });
  return parseJsonOrThrow(response);
}

export interface SaveInvoiceDraftReviewInput {
  patch?: UpdateInvoiceDraftInput;
  items?: InvoiceDraftItemInput[];
}

/**
 * Correção pós-revisão Codex (achado 9) — grava cabeçalho + linhas num
 * único pedido (`PATCH :id/review`), atómico no backend
 * (`InvoiceDraftsService.saveReview()`, mesma transação Prisma). Antes,
 * `invoice-draft-review-sheet.tsx` chamava `updateInvoiceDraft()` e
 * `replaceInvoiceDraftItems()` como dois pedidos independentes — se o
 * primeiro tivesse sucesso e o segundo falhasse, o cabeçalho ficava
 * persistido no servidor sem a UI nunca o refletir localmente nem
 * distinguir esse caso de "nada foi guardado". `updateInvoiceDraft()`/
 * `replaceInvoiceDraftItems()` continuam disponíveis para outros
 * consumidores — sem alterações.
 */
export async function saveInvoiceDraftReview(
  accessToken: string,
  id: string,
  input: SaveInvoiceDraftReviewInput,
): Promise<InvoiceDraft> {
  const response = await fetch(`${API_URL}/invoices/drafts/${id}/review`, {
    method: 'PATCH',
    headers: authJsonHeaders(accessToken),
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow(response);
}
