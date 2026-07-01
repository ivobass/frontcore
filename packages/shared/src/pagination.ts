/** Parâmetros de paginação genéricos. */
export interface PaginationParams {
  page: number;
  pageSize: number;
}

/** Resposta paginada genérica. */
export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Normaliza parâmetros de paginação dentro de limites seguros. */
export function normalizePagination(
  params: Partial<PaginationParams>,
): PaginationParams {
  const page = Math.max(1, Math.trunc(params.page ?? DEFAULT_PAGE));
  const rawSize = Math.trunc(params.pageSize ?? DEFAULT_PAGE_SIZE);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, rawSize));
  return { page, pageSize };
}
