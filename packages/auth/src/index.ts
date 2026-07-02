/**
 * @frontcore/auth
 * Autenticação/autorização genéricas para produtos FrontCore: hashing de
 * password, JWT + refresh tokens, roles e guards NestJS. Sem lógica de
 * domínio — qualquer produto FrontCore reutiliza isto sem alterações.
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

/** Contrato de um serviço de tokens. */
export interface TokenService {
  issue(identity: AuthenticatedIdentity): Promise<TokenPair>;
  verifyAccess(token: string): Promise<AuthenticatedIdentity>;
  rotateRefresh(refreshToken: string): Promise<TokenPair>;
  revoke(refreshToken: string): Promise<void>;
}

export * from './password';
export * from './jwt';
export * from './roles';
export * from './nestjs';
