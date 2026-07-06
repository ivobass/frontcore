import { API_URL } from './api';

export interface Supplier {
  id: string;
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

async function parseJsonOrThrow(response: Response): Promise<any> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message ?? 'Pedido falhou.');
  }
  return data;
}

export async function listSuppliers(
  accessToken: string,
): Promise<Paginated<Supplier>> {
  const response = await fetch(`${API_URL}/suppliers`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return parseJsonOrThrow(response);
}
