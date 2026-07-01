/**
 * @frontcore/auth
 * Contratos genéricos de autenticação/autorização para produtos FrontCore.
 * A implementação concreta (JWT, refresh tokens, guards) entra na Fase 2.
 * Aqui vivem apenas os TIPOS de fronteira — sem lógica de domínio.
 */

/** Identidade autenticada resolvida a partir de um token de acesso. */
export interface AuthenticatedIdentity {
  userId: string;
  organizationId: string;
  role: string;
  isSuperAdmin: boolean;
}

/** Par de tokens emitido no login/refresh. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** Configuração genérica de emissão de tokens. */
export interface TokenConfig {
  accessSecret: string;
  refreshSecret: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
}

/** Contrato de um serviço de tokens (implementado na Fase 2). */
export interface TokenService {
  issue(identity: AuthenticatedIdentity): Promise<TokenPair>;
  verifyAccess(token: string): Promise<AuthenticatedIdentity>;
  rotateRefresh(refreshToken: string): Promise<TokenPair>;
  revoke(refreshToken: string): Promise<void>;
}
