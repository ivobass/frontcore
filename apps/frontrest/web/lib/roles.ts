/**
 * Ordem de privilégio RBAC — espelha `packages/auth/src/roles.ts` só para
 * decisões de UI (esconder ações, nunca a única proteção: a API já aplica
 * `@Roles('MANAGER')` no servidor). Não importa `@frontcore/auth` porque
 * esse package é backend-only (NestJS); esta cópia é intencionalmente
 * mínima e local ao frontend.
 */
const ROLE_ORDER = ['MEMBER', 'MANAGER', 'ADMIN', 'OWNER'];

/** Pode criar/editar/apagar fornecedores, categorias e faturas. */
export function canManage(role: string): boolean {
  return ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf('MANAGER');
}
