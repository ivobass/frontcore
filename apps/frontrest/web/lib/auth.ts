import { API_URL, ApiError, parseJsonOrThrow, authHeaders } from './api';

/** Exportada (correção final pós-revisão Codex) — `SessionProvider` precisa de a comparar contra `StorageEvent.key` para reagir a mudanças de sessão feitas por outra tab. */
export const SESSION_KEY = 'frontrest.session';

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
 * Sinal explícito de que um pedido pertence a uma sessão já superada —
 * correção final pós-revisão Codex (isolamento temporal): nunca
 * confundido com `SessionExpiredError` (a sessão CORRENTE pode
 * continuar perfeitamente válida; só este pedido específico, iniciado
 * antes de um logout/`sessionExpired()`/troca de sessão, é que já não
 * pertence a ela). Lançado por `useSession().authFetch()`
 * (`lib/session-context.tsx`) quando a "generation" capturada no início
 * do pedido deixou de ser a corrente — nunca aplica tokens renovados
 * nem repete o pedido original nesse caso. Quem apanha este erro nunca
 * deve mostrar o 401 cru nem tratar a sessão corrente como terminada —
 * o componente que o originou está, por construção, já desmontado (a
 * árvore sob `SessionProvider` só existe enquanto a sessão que a criou
 * continuar corrente).
 */
export class StaleSessionError extends Error {
  constructor() {
    super('Este pedido pertence a uma sessão que já terminou.');
    this.name = 'StaleSessionError';
  }
}

/**
 * Predicado partilhado — os dois sinais que qualquer chamador de
 * `authFetch()` deve tratar da mesma forma (nunca mostrar como erro
 * comum, nunca repetir a operação): a sessão terminou de vez
 * (`SessionExpiredError`) ou este pedido específico já não pertence à
 * sessão corrente (`StaleSessionError`). Único ponto que decide esta
 * equivalência — nunca um `instanceof` repetido/divergente por
 * componente.
 */
export function isSessionLifecycleError(err: unknown): boolean {
  return err instanceof SessionExpiredError || err instanceof StaleSessionError;
}

/**
 * Renovações em curso ou já concluídas, indexadas pelo `refreshToken`
 * que as despoletou — correção final pós-revisão Codex: um `pendingRefresh`
 * único (limpo assim que a renovação termina) tinha uma race real —
 *
 * 1. A e B usam o mesmo `accessToken`/`refreshToken` expirados.
 * 2. A recebe 401 primeiro e arranca a renovação.
 * 3. A renovação termina (`pendingRefresh` volta a `null`).
 * 4. Só depois B recebe o seu próprio 401 — ainda associado às MESMAS
 *    credenciais antigas que A já tinha usado.
 * 5. Sem cache, B tenta renovar outra vez com `refreshToken` — já
 *    rodado/revogado pelo backend na renovação de A
 *    (`AuthService.refresh()`, revoga sempre o token usado) — recebe
 *    401 do próprio `/auth/refresh` e termina a sessão por engano,
 *    apesar de a sessão continuar genuinamente válida (A já a renovou).
 *
 * Indexado por `refreshToken` (nunca um singleton global) — um pedido
 * atrasado que apresente EXATAMENTE o mesmo `refreshToken` já usado por
 * uma renovação em curso ou concluída reutiliza sempre o mesmo
 * resultado, nunca dispara uma segunda chamada a `/auth/refresh`. Uma
 * sessão nova (login novo, ou renovação seguinte já com tokens
 * diferentes) usa sempre uma chave diferente — nunca adere por engano a
 * uma entrada antiga. Nunca removida no sucesso (ao contrário do
 * `pendingRefresh` anterior) — é exatamente essa remoção prematura que
 * permitia a race; cada `refreshToken` só é emitido/consumido uma única
 * vez no backend, por isso reter o resultado indefinidamente nunca serve
 * dados errados a um pedido posterior genuinamente novo (que usa sempre
 * uma chave diferente). Limitado a `MAX_CACHED_REFRESHES` entradas (a
 * mais antiga é despejada — `Map` preserva ordem de inserção) só para
 * nunca crescer sem limite numa sessão de browser muito longa; o número
 * real de renovações por sessão é sempre pequeno (uma por expiração do
 * `accessToken`).
 */
const MAX_CACHED_REFRESHES = 20;

/**
 * Janela curta e explícita durante a qual um pedido que perdeu a corrida
 * de renovação (401 na própria chamada a `/auth/refresh`, porque outra
 * tab já rodou o `refreshToken`) espera por um resultado externo antes
 * de desistir — correção pós-revisão Codex, Secção 1. Determinística
 * (um único `setTimeout` por pedido em espera, nunca polling): resolve
 * de imediato assim que `recordExternalRefresh()` publica o resultado
 * para o mesmo `refreshToken`, independentemente da ordem de chegada
 * entre o 401 local e o evento `storage` da outra tab. Só se esgota o
 * tempo é que a sessão é dada como genuinamente expirada. 500ms — bem
 * acima do tempo típico de um round-trip de rede a `/auth/refresh`
 * (cobre folgadamente a corrida real entre duas tabs), mas curto o
 * suficiente para nunca introduzir um atraso percetível no caso comum
 * (uma só tab, sem corrida nenhuma) até a mensagem de sessão expirada
 * aparecer ao utilizador.
 */
export const EXTERNAL_REFRESH_WAIT_MS = 500;

interface PendingWaiter {
  resolve: (tokens: RefreshedTokens | null) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Estado de coordenação de renovações — isolado numa fábrica (em vez de
 * `Map`s soltos ao nível do módulo) para que os testes possam construir
 * uma segunda instância genuinamente independente e assim provar a
 * coordenação cross-tab através do único canal que duas tabs reais
 * partilham (o evento `storage`), nunca através de um `Map` de módulo
 * acidentalmente comum às duas — correção pós-revisão Codex, Secção 1
 * ("não depender do Map partilhado do mesmo módulo para provar a
 * coordenação cross-tab"). O código de produção usa sempre a instância
 * partilhada por omissão (`defaultCoordinator`, abaixo); só os testes de
 * `lib/auth.test.ts` que precisam de simular duas tabs realmente
 * separadas constroem a sua própria via `createRefreshCoordinator()`.
 */
function createRefreshCoordinator() {
  const refreshesByToken = new Map<string, Promise<RefreshedTokens>>();
  const externalResultsByToken = new Map<string, RefreshedTokens>();
  const waitersByToken = new Map<string, PendingWaiter[]>();

  function addWaiter(refreshToken: string, waiter: PendingWaiter) {
    const list = waitersByToken.get(refreshToken);
    if (list) list.push(waiter);
    else waitersByToken.set(refreshToken, [waiter]);
  }

  function removeWaiter(refreshToken: string, waiter: PendingWaiter) {
    const list = waitersByToken.get(refreshToken);
    if (!list) return;
    const index = list.indexOf(waiter);
    if (index !== -1) list.splice(index, 1);
    if (list.length === 0) waitersByToken.delete(refreshToken);
  }

  function settleWaiter(waiter: PendingWaiter, tokens: RefreshedTokens | null) {
    clearTimeout(waiter.timer);
    waiter.resolve(tokens);
  }

  function waitForExternalRefresh(
    refreshToken: string,
    timeoutMs: number,
  ): Promise<RefreshedTokens | null> {
    const existing = externalResultsByToken.get(refreshToken);
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve) => {
      const waiter: PendingWaiter = {
        resolve,
        timer: setTimeout(() => {
          removeWaiter(refreshToken, waiter);
          resolve(null);
        }, timeoutMs),
      };
      addWaiter(refreshToken, waiter);
    });
  }

  /**
   * Publica o resultado de uma renovação ocorrida NOUTRA tab — chamado
   * por `SessionProvider` ao reagir a um evento `storage` que muda
   * `SESSION_KEY` para uma sessão com um `refreshToken` diferente do
   * anterior. Nunca substitui uma entrada já registada para o mesmo
   * `refreshToken` (só pode ter havido um vencedor real no backend);
   * bounded pela mesma disciplina de `refreshesByToken`. Resolve de
   * imediato qualquer pedido em espera (`waitForExternalRefresh`, acima)
   * para o mesmo `refreshToken` — nunca obriga quem está à espera a
   * esgotar a janela de timeout se o resultado já chegou.
   */
  function recordExternalRefresh(fromRefreshToken: string, tokens: RefreshedTokens): void {
    if (!externalResultsByToken.has(fromRefreshToken)) {
      externalResultsByToken.set(fromRefreshToken, tokens);
      if (externalResultsByToken.size > MAX_CACHED_REFRESHES) {
        const oldestKey = externalResultsByToken.keys().next().value;
        if (oldestKey !== undefined) externalResultsByToken.delete(oldestKey);
      }
    }
    const resolved = externalResultsByToken.get(fromRefreshToken)!;
    const waiters = waitersByToken.get(fromRefreshToken);
    if (waiters) {
      waitersByToken.delete(fromRefreshToken);
      for (const waiter of waiters) settleWaiter(waiter, resolved);
    }
  }

  /**
   * Limpa toda a cache de renovações (local, externa e à espera) —
   * chamado por `SessionProvider` sempre que a sessão local termina
   * (logout, `sessionExpired()`, troca de identidade S1→S2, ou reação a
   * `localStorage` limpo por outra tab) — correção pós-revisão Codex,
   * Secção 6: nenhum waiter deve ficar pendente além do fim da sessão a
   * que pertence. Resolve (nunca rejeita) os waiters restantes com
   * `null`, para quem está em `refreshSessionOnce()` avançar de imediato
   * para a sua própria verificação de geração/montagem em vez de
   * esperar pelo timeout completo. Nunca a única defesa contra
   * reaproveitamento indevido (essa é sempre `isOperationStillCurrent()`
   * em `session-context.tsx`) — só higiene adicional.
   */
  function clearRefreshCache(): void {
    refreshesByToken.clear();
    externalResultsByToken.clear();
    for (const list of waitersByToken.values()) {
      for (const waiter of list) settleWaiter(waiter, null);
    }
    waitersByToken.clear();
  }

  function refreshSessionOnce(refreshToken: string): Promise<RefreshedTokens> {
    const external = externalResultsByToken.get(refreshToken);
    if (external) return Promise.resolve(external);

    const cached = refreshesByToken.get(refreshToken);
    if (cached) return cached;

    const promise = refreshSession(refreshToken).catch(async (err) => {
      // Recuperação de corrida genuína — ver `externalResultsByToken`,
      // acima. Verificação imediata primeiro (resultado já publicado
      // antes desta chamada sequer falhar); só depois espera pela janela
      // curta e explícita — nunca depende da ordem de chegada entre o
      // 401 local e o evento `storage` da outra tab.
      const recovered = externalResultsByToken.get(refreshToken);
      if (recovered) return recovered;
      const waited = await waitForExternalRefresh(refreshToken, EXTERNAL_REFRESH_WAIT_MS);
      if (waited) return waited;
      throw err;
    });
    refreshesByToken.set(refreshToken, promise);
    if (refreshesByToken.size > MAX_CACHED_REFRESHES) {
      const oldestKey = refreshesByToken.keys().next().value;
      if (oldestKey !== undefined) refreshesByToken.delete(oldestKey);
    }
    return promise;
  }

  return { refreshSessionOnce, recordExternalRefresh, clearRefreshCache };
}

export type RefreshCoordinator = ReturnType<typeof createRefreshCoordinator>;

/**
 * Construtor de uma instância de coordenação de renovações totalmente
 * independente da partilhada pelo módulo — nunca usado pelo código de
 * produção (que usa sempre a instância por omissão de `withAuthRetry()`,
 * abaixo), exportado exclusivamente para `lib/auth.test.ts` poder
 * simular duas tabs genuinamente separadas (cada uma com os seus
 * próprios `Map`s de cache/waiters) comunicando apenas através do
 * mesmo mecanismo que duas tabs reais usam: uma chamada explícita a
 * `recordExternalRefresh()` da segunda instância, a simular a entrega
 * do evento `storage` que `SessionProvider` faria na prática.
 */
export function createIsolatedRefreshCoordinator(): RefreshCoordinator {
  return createRefreshCoordinator();
}

const defaultCoordinator = createRefreshCoordinator();

export const recordExternalRefresh = defaultCoordinator.recordExternalRefresh;
export const clearRefreshCache = defaultCoordinator.clearRefreshCache;

/**
 * Executa `request(accessToken)`; se falhar com 401, tenta renovar a
 * sessão uma única vez via `refreshSessionOnce()` (partilhada entre
 * pedidos 401 concorrentes, acima) e repete o pedido com o `accessToken`
 * novo — nunca mais do que uma tentativa de renovação, para nunca entrar
 * em ciclo se o próprio `refreshToken` também já tiver expirado.
 * `onTokensRefreshed` persiste os novos tokens (ex.
 * `useSession().updateTokens()`) antes da repetição, para qualquer pedido
 * seguinte já usar o token renovado. Falha da renovação nunca repete o
 * pedido original — propaga sempre `SessionExpiredError`, para quem
 * chama poder terminar sessão de forma explícita (`useSession().
 * sessionExpired()`), em vez de mostrar ao utilizador o 401 cru.
 *
 * Seguro para pedidos não idempotentes (POST/PATCH/DELETE): o 401 que
 * despoleta este retry vem sempre de `JwtAuthGuard` (`packages/auth`),
 * um `APP_GUARD` global que corre sempre antes de qualquer handler —
 * nenhum endpoint protegido (`invoices`, `invoices/drafts`, `ai/chat`)
 * processa a operação antes de validar o token. Um 401 significa sempre
 * "nunca chegou a processar", nunca "processou e falhou depois" — repetir
 * o pedido original nunca duplica a operação.
 *
 * `coordinator` — sempre a instância partilhada do módulo por omissão;
 * parâmetro exposto apenas para `lib/auth.test.ts` poder injetar uma
 * instância isolada (`createIsolatedRefreshCoordinator()`) e assim
 * simular duas tabs genuinamente separadas na prova da corrida
 * multi-tab (Secção 1). Nunca usado com outro valor em código de
 * produção.
 */
export async function withAuthRetry<T>(
  accessToken: string,
  refreshToken: string,
  request: (accessToken: string) => Promise<T>,
  onTokensRefreshed: (tokens: RefreshedTokens) => void,
  coordinator: RefreshCoordinator = defaultCoordinator,
): Promise<T> {
  try {
    return await request(accessToken);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) {
      throw err;
    }
    let renewed: RefreshedTokens;
    try {
      renewed = await coordinator.refreshSessionOnce(refreshToken);
    } catch {
      throw new SessionExpiredError();
    }
    onTokensRefreshed(renewed);
    return request(renewed.accessToken);
  }
}

/**
 * Forma partilhada da chamada autenticada centralizada exposta por
 * `useSession()` (`lib/session-context.tsx`) — correção final
 * pós-revisão Codex: substitui a duplicação anterior de `callWithRetry()`
 * local, reimplementada em cada folha/diálogo (`InvoiceDraftReviewSheet`,
 * `InvoiceFormSheet`, `AiChatPage`), cada uma com os seus próprios props
 * `refreshToken`/`onTokensRefreshed`/`onSessionExpired`. Uma única
 * implementação, em `SessionProvider`, lê sempre os tokens mais recentes
 * de uma `ref` (nunca uma closure presa ao início do handler — a mesma
 * causa raiz de um handler que encadeia vários pedidos autenticados
 * usar tokens já desatualizados depois de o primeiro pedido ter
 * renovado a sessão a meio) e trata `SessionExpiredError` de forma
 * uniforme (`sessionExpired()`), sem cada consumidor repetir essa
 * lógica. Interface (não `type` com genérico preso) para o parâmetro de
 * tipo poder variar por chamada.
 */
export interface AuthFetch {
  <T>(request: (accessToken: string) => Promise<T>): Promise<T>;
}
