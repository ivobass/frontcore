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
  createdAt: string;
  updatedAt: string;
  supplier: InvoiceSupplierRef | null;
  category: InvoiceCategoryRef | null;
  storageObject: InvoiceDraftStorageObjectRef;
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
