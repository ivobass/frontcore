import { randomBytes, createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import { requireEnv, optionalEnv } from '@frontcore/config';
import type { AuthenticatedIdentity } from './index';

/** Lê a configuração de tokens a partir do ambiente (nomes genéricos). */
export function loadTokenConfig() {
  return {
    accessSecret: requireEnv('JWT_ACCESS_SECRET'),
    refreshSecret: requireEnv('JWT_REFRESH_SECRET'),
    accessTtlSeconds: Number(optionalEnv('JWT_ACCESS_TTL', '900')),
    refreshTtlSeconds: Number(optionalEnv('JWT_REFRESH_TTL', '1209600')),
  };
}

interface AccessTokenPayload {
  sub: string;
  organizationId: string;
  role: string;
  isSuperAdmin: boolean;
}

/** Assina um access token JWT de curta duração. */
export function signAccessToken(
  identity: AuthenticatedIdentity,
  secret: string,
  ttlSeconds: number,
): string {
  const payload: AccessTokenPayload = {
    sub: identity.userId,
    organizationId: identity.organizationId,
    role: identity.role,
    isSuperAdmin: identity.isSuperAdmin,
  };
  return jwt.sign(payload, secret, { expiresIn: ttlSeconds });
}

/** Verifica e descodifica um access token JWT. Lança se inválido/expirado. */
export function verifyAccessToken(
  token: string,
  secret: string,
): AuthenticatedIdentity {
  const decoded = jwt.verify(token, secret) as AccessTokenPayload;
  return {
    userId: decoded.sub,
    organizationId: decoded.organizationId,
    role: decoded.role,
    isSuperAdmin: decoded.isSuperAdmin,
  };
}

/**
 * Refresh tokens NÃO são JWT: são um valor opaco aleatório, guardado em BD
 * apenas como hash (nunca em texto simples), o que permite revogação
 * imediata e rotação — o standard mais seguro para este fluxo.
 */
export function generateRefreshTokenValue(): string {
  return randomBytes(48).toString('hex');
}

/** Hash determinístico (SHA-256) de um refresh token, para guardar em BD. */
export function hashRefreshTokenValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
