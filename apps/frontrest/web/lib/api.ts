/** Base URL da API, injetada em build time pelo Next. */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

/**
 * Erro de API com o status HTTP anexado — permite ao chamador distinguir
 * classes de falha (ex. 409/404 "nunca chegou a existir" vs. 503
 * "existe, só uma etapa seguinte falhou") sem repetir `fetch`/parsing.
 * Estende `Error`, por isso qualquer `catch (err) { err.message }`
 * já existente continua a funcionar sem alteração.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Lê o corpo JSON de uma resposta `fetch` e lança se o pedido falhou.
 * Partilhado por todos os clientes de API do FrontRest — não duplicar.
 */
export async function parseJsonOrThrow(response: Response): Promise<any> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(data?.message ?? 'Pedido falhou.', response.status);
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
