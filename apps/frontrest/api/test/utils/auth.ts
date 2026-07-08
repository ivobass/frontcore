import { signAccessToken } from '@frontcore/auth';
import type { AuthenticatedIdentity } from '@frontcore/auth';

/** Identidade sintética por omissão para os testes — sobrescrever campos conforme o caso. */
export function buildIdentity(
  overrides: Partial<AuthenticatedIdentity> = {},
): AuthenticatedIdentity {
  return {
    userId: 'user-1',
    organizationId: 'org-1',
    role: 'MEMBER',
    isSuperAdmin: false,
    ...overrides,
  };
}

/** Assina um access token real (mesma função usada em produção) para os testes e2e. */
export function tokenFor(overrides: Partial<AuthenticatedIdentity> = {}): string {
  return signAccessToken(
    buildIdentity(overrides),
    process.env.JWT_ACCESS_SECRET as string,
    900,
  );
}

/** Header `Authorization` pronto a usar em pedidos `supertest`. */
export function authHeader(overrides: Partial<AuthenticatedIdentity> = {}): string {
  return `Bearer ${tokenFor(overrides)}`;
}
