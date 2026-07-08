import { API_URL, authHeaders, authJsonHeaders, buildQuery, parseJsonOrThrow } from './api';
import type { Paginated } from './api';

export type { Paginated } from './api';

export interface Supplier {
  id: string;
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListSuppliersParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

export interface SupplierInput {
  name: string;
  taxId?: string;
  email?: string;
  phone?: string;
}

export async function listSuppliers(
  accessToken: string,
  params: ListSuppliersParams = {},
): Promise<Paginated<Supplier>> {
  const response = await fetch(`${API_URL}/suppliers${buildQuery(params)}`, {
    headers: authHeaders(accessToken),
  });
  return parseJsonOrThrow(response);
}

export async function getSupplier(
  accessToken: string,
  id: string,
): Promise<Supplier> {
  const response = await fetch(`${API_URL}/suppliers/${id}`, {
    headers: authHeaders(accessToken),
  });
  return parseJsonOrThrow(response);
}

export async function createSupplier(
  accessToken: string,
  input: SupplierInput,
): Promise<Supplier> {
  const response = await fetch(`${API_URL}/suppliers`, {
    method: 'POST',
    headers: authJsonHeaders(accessToken),
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow(response);
}

export async function updateSupplier(
  accessToken: string,
  id: string,
  input: Partial<SupplierInput>,
): Promise<Supplier> {
  const response = await fetch(`${API_URL}/suppliers/${id}`, {
    method: 'PATCH',
    headers: authJsonHeaders(accessToken),
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow(response);
}

export async function deleteSupplier(
  accessToken: string,
  id: string,
): Promise<void> {
  const response = await fetch(`${API_URL}/suppliers/${id}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
  await parseJsonOrThrow(response);
}
