/** Base URL da API, injetada em build time pelo Next. */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

/**
 * Lê o corpo JSON de uma resposta `fetch` e lança se o pedido falhou.
 * Partilhado por todos os clientes de API do FrontRest — não duplicar.
 */
export async function parseJsonOrThrow(response: Response): Promise<any> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message ?? 'Pedido falhou.');
  }
  return data;
}

/** Headers de autenticação Bearer, para pedidos a rotas protegidas. */
export function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

/** Headers de autenticação + JSON, para pedidos POST/PATCH com corpo. */
export function authJsonHeaders(accessToken: string): HeadersInit {
  return { ...authHeaders(accessToken), 'Content-Type': 'application/json' };
}

/** Envelope de paginação partilhado — espelha `Paginated<T>` de `@frontcore/shared`. */
export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Constrói uma query string a partir de parâmetros opcionais. */
export function buildQuery<T extends object>(params: T): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(
    params as Record<string, string | number | undefined>,
  )) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  const qs = query.toString();
  return qs ? `?${qs}` : '';
}
