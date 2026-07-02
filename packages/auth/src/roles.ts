/**
 * Roles genéricos de RBAC (espelham o enum Role do @frontcore/database,
 * mantidos como union type próprio para @frontcore/auth não depender de
 * @frontcore/database).
 */
export type AppRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'MEMBER';

/** Ordem crescente de privilégio. */
const ROLE_ORDER: AppRole[] = ['MEMBER', 'MANAGER', 'ADMIN', 'OWNER'];

/** Verifica se `role` cumpre pelo menos o privilégio de `required`. */
export function hasRequiredRole(role: AppRole, required: AppRole): boolean {
  return ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(required);
}
