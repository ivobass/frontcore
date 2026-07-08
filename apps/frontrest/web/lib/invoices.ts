import { API_URL, authHeaders, authJsonHeaders, buildQuery, parseJsonOrThrow } from './api';
import type { Paginated } from './api';

export type { Paginated } from './api';

/** Espelha o enum `InvoiceStatus` de `@frontcore/database` (package backend-only). */
export type InvoiceStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
}

export interface InvoiceSupplierRef {
  id: string;
  name: string;
}

export interface InvoiceCategoryRef {
  id: string;
  name: string;
}

export interface Invoice {
  id: string;
  supplierId: string;
  categoryId: string | null;
  number: string | null;
  issueDate: string;
  dueDate: string | null;
  totalAmount: string;
  status: InvoiceStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  supplier: InvoiceSupplierRef;
  category: InvoiceCategoryRef | null;
  items: InvoiceItem[];
}

export interface ListInvoicesParams {
  page?: number;
  pageSize?: number;
  supplierId?: string;
  status?: InvoiceStatus;
}

export interface InvoiceItemInput {
  description: string;
  quantity?: number;
  unitPrice: number;
}

export interface InvoiceInput {
  supplierId: string;
  categoryId?: string;
  number?: string;
  issueDate: string;
  dueDate?: string;
  status?: InvoiceStatus;
  notes?: string;
  items: InvoiceItemInput[];
}

export async function listInvoices(
  accessToken: string,
  params: ListInvoicesParams = {},
): Promise<Paginated<Invoice>> {
  const response = await fetch(`${API_URL}/invoices${buildQuery(params)}`, {
    headers: authHeaders(accessToken),
  });
  return parseJsonOrThrow(response);
}

export async function getInvoice(
  accessToken: string,
  id: string,
): Promise<Invoice> {
  const response = await fetch(`${API_URL}/invoices/${id}`, {
    headers: authHeaders(accessToken),
  });
  return parseJsonOrThrow(response);
}

export async function createInvoice(
  accessToken: string,
  input: InvoiceInput,
): Promise<Invoice> {
  const response = await fetch(`${API_URL}/invoices`, {
    method: 'POST',
    headers: authJsonHeaders(accessToken),
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow(response);
}

export async function updateInvoice(
  accessToken: string,
  id: string,
  input: Partial<InvoiceInput>,
): Promise<Invoice> {
  const response = await fetch(`${API_URL}/invoices/${id}`, {
    method: 'PATCH',
    headers: authJsonHeaders(accessToken),
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow(response);
}

export async function deleteInvoice(
  accessToken: string,
  id: string,
): Promise<void> {
  const response = await fetch(`${API_URL}/invoices/${id}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
  await parseJsonOrThrow(response);
}
