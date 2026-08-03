import { API_URL, ApiError, parseJsonOrThrow, authHeaders } from './api';

const SESSION_KEY = 'frontrest.session';

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string | null };
  organization: { id: string; name: string; slug: string };
  role: string;
}

export function saveSession(session: Session): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(SESSION_KEY);
}

export async function register(input: {
  email: string;
  password: string;
  name: string;
  organizationName: string;
}): Promise<Session> {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow(response);
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<Session> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow(response);
}

export async function logout(refreshToken: string): Promise<void> {
  await fetch(`${API_URL}/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  }).catch(() => undefined);
}

/** Novo par de tokens emitido por `POST /auth/refresh` — espelha o `TokenPair` do backend (`AuthService.refresh()`). */
export interface RefreshedTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Renova o `accessToken` a partir do `refreshToken` guardado — endpoint
 * `POST /auth/refresh` já existia no backend (`AuthService.refresh()`,
 * Fase de autenticação) mas nunca tinha um consumidor no frontend
 * (hardening pós-validação manual: "Token de acesso inválido ou
 * expirado." surgia em qualquer pedido depois do `accessToken` de
 * curta duração expirar, sem qualquer tentativa de renovação). Lança
 * `ApiError` (401) quando o `refreshToken` também já não é válido — quem
 * chama decide então terminar sessão, nunca reinterpretado aqui.
 */
export async function refreshSession(refreshToken: string): Promise<RefreshedTokens> {
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  return parseJsonOrThrow(response);
}

export async function fetchMe(accessToken: string): Promise<any> {
  const response = await fetch(`${API_URL}/auth/me`, {
    headers: authHeaders(accessToken),
  });
  return parseJsonOrThrow(response);
}

/** Sinal explícito de que a sessão terminou de vez (o `refreshToken` também já não é válido) — nunca confundido com um 401 comum de um pedido isolado. */
export class SessionExpiredError extends Error {
  constructor() {
    super('A sua sessão expirou. Inicie sessão novamente.');
    this.name = 'SessionExpiredError';
  }
}

/**
 * Executa `request(accessToken)`; se falhar com 401, tenta renovar a
 * sessão uma única vez via `refreshSession()` e repete o pedido com o
 * `accessToken` novo — nunca mais do que uma tentativa de renovação, para
 * nunca entrar em ciclo se o próprio `refreshToken` também já tiver
 * expirado. `onTokensRefreshed` persiste os novos tokens (ex.
 * `useSession().updateTokens()`) antes da repetição, para qualquer pedido
 * seguinte já usar o token renovado. Falha da renovação nunca repete o
 * pedido original — propaga sempre `SessionExpiredError`, para quem
 * chama poder terminar sessão de forma explícita (`logout()` +
 * redirecionamento), em vez de mostrar ao utilizador o 401 cru.
 */
export async function withAuthRetry<T>(
  accessToken: string,
  refreshToken: string,
  request: (accessToken: string) => Promise<T>,
  onTokensRefreshed: (tokens: RefreshedTokens) => void,
): Promise<T> {
  try {
    return await request(accessToken);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) {
      throw err;
    }
    let renewed: RefreshedTokens;
    try {
      renewed = await refreshSession(refreshToken);
    } catch {
      throw new SessionExpiredError();
    }
    onTokensRefreshed(renewed);
    return request(renewed.accessToken);
  }
}
