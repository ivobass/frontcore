import { StrictMode } from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { SessionProvider, useSession } from './session-context';
import { SESSION_KEY, clearRefreshCache } from './auth';
import type { Session } from './auth';
import { ApiError } from './api';

const push = vi.fn();
// Referência estável (nunca um objeto literal novo por chamada) —
// `useRouter()` real do Next.js devolve sempre a mesma referência entre
// renders; um mock ingénuo que devolvesse `{ push }` novo a cada
// chamada quebraria a dependência `[router]` do `useEffect` de
// bootstrap em `SessionProvider`, disparando um bootstrap duplicado a
// cada re-render (achado real ao escrever este teste).
const router = { push };

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

const BASE_SESSION: Session = {
  accessToken: 'access-original',
  refreshToken: 'refresh-original',
  user: { id: 'user-1', email: 'ana@example.com', name: 'Ana' },
  organization: { id: 'org-1', name: 'ACME', slug: 'acme' },
  role: 'MANAGER',
};

const ME_RESPONSE = {
  user: BASE_SESSION.user,
  organization: BASE_SESSION.organization,
  role: BASE_SESSION.role,
  isSuperAdmin: false,
};

/**
 * Consumidor mínimo — expõe `session`/`me` no DOM e as ações do contexto
 * via botões, para exercitar `SessionProvider` real (nunca mockado).
 * `onReady` (opcional) recebe o valor de contexto MAIS RECENTE a cada
 * render — usado pelos testes de isolamento temporal/multi-tab abaixo
 * para chamar `authFetch()`/`sessionExpired()`/etc. diretamente, com
 * controlo fino sobre o momento exato de cada chamada (impossível só
 * com cliques em botões).
 */
function TestConsumer({ onReady }: { onReady?: (ctx: ReturnType<typeof useSession>) => void }) {
  const ctx = useSession();
  const { session, me, updateTokens, sessionExpired, authFetch } = ctx;
  onReady?.(ctx);
  return (
    <div>
      <p data-testid="access-token">{session.accessToken}</p>
      <p data-testid="refresh-token">{session.refreshToken}</p>
      <p data-testid="user-email">{me.user.email}</p>
      <button onClick={() => updateTokens({ accessToken: 'access-updated', refreshToken: 'refresh-updated' })}>
        updateTokens
      </button>
      <button onClick={() => sessionExpired()}>sessionExpired</button>
      <button onClick={() => authFetch(async (token) => token)}>authFetch</button>
    </div>
  );
}

/** Responde `/auth/me` e `/auth/refresh` de forma independente, por URL — nunca um mock estático que finge sempre sucesso. */
function mockFetch(responses: { me: Response[]; refresh?: Response[] }) {
  const meQueue = [...responses.me];
  const refreshQueue = [...(responses.refresh ?? [])];
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/auth/me')) {
      const next = meQueue.shift();
      if (!next) throw new Error('mockFetch: fila de /auth/me esgotada');
      return Promise.resolve(next.clone());
    }
    if (url.includes('/auth/refresh')) {
      const next = refreshQueue.shift();
      if (!next) throw new Error('mockFetch: fila de /auth/refresh esgotada');
      return Promise.resolve(next.clone());
    }
    throw new Error(`mockFetch: URL inesperada ${url}`);
  });
}

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

function unauthorizedResponse(message: string): Response {
  return new Response(JSON.stringify({ message }), { status: 401 });
}

/**
 * jsdom nunca dispara o evento `storage` na MESMA janela que fez a
 * escrita (comportamento correto — replica o browser real: o evento só
 * chega a OUTRAS janelas/tabs). Como um único teste só tem uma `window`,
 * simulamos aqui exatamente o que o browser entregaria a uma tab
 * diferente — nunca mascarando a lógica de `SessionProvider` em si, só a
 * fronteira de transporte entre tabs. Partilhado por todos os `describe`
 * deste ficheiro que precisam de simular um evento vindo de outra tab
 * (coordenação multi-tab, bootstrap cancelado por logout externo, troca
 * de identidade).
 */
function dispatchStorage(oldSession: Session | null, newSession: Session | null) {
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: SESSION_KEY,
      oldValue: oldSession ? JSON.stringify(oldSession) : null,
      newValue: newSession ? JSON.stringify(newSession) : null,
    }),
  );
}

describe('SessionProvider — hardening de sessão (correção final pós-revisão Codex)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    push.mockClear();
    // A cache de renovações (`lib/auth.ts`) é módulo-level, partilhada
    // por TODOS os testes deste ficheiro — vários reutilizam
    // `BASE_SESSION` (o mesmo `refreshToken`); sem limpar aqui, um
    // teste anterior que já renovou com sucesso deixaria um resultado
    // em cache que mascararia o comportamento (rede, sucesso/falha) que
    // o teste seguinte precisa de exercitar genuinamente.
    clearRefreshCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('access token válido — /auth/me funciona sem qualquer tentativa de refresh', async () => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(BASE_SESSION));
    mockFetch({ me: [okResponse(ME_RESPONSE)] });

    render(
      <SessionProvider>
        <TestConsumer />
      </SessionProvider>,
    );

    expect(await screen.findByTestId('user-email')).toHaveTextContent('ana@example.com');
    expect(screen.getByTestId('access-token')).toHaveTextContent('access-original');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/me'), expect.anything());
    expect(push).not.toHaveBeenCalled();
  });

  it('access token expirado + refresh token válido — renova, repete /auth/me com o token novo, e persiste os dois tokens novos', async () => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(BASE_SESSION));
    mockFetch({
      me: [unauthorizedResponse('Token de acesso inválido ou expirado.'), okResponse(ME_RESPONSE)],
      refresh: [okResponse({ accessToken: 'access-bootstrap-novo', refreshToken: 'refresh-bootstrap-novo' })],
    });

    render(
      <SessionProvider>
        <TestConsumer />
      </SessionProvider>,
    );

    expect(await screen.findByTestId('user-email')).toHaveTextContent('ana@example.com');
    expect(screen.getByTestId('access-token')).toHaveTextContent('access-bootstrap-novo');
    expect(screen.getByTestId('refresh-token')).toHaveTextContent('refresh-bootstrap-novo');

    // `/auth/me` chamado duas vezes (401 + repetição), `/auth/refresh` uma única vez.
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string);
    expect(calls.filter((url) => url.includes('/auth/me'))).toHaveLength(2);
    expect(calls.filter((url) => url.includes('/auth/refresh'))).toHaveLength(1);

    // Sessão persistida em localStorage já com os dois tokens novos — user/organization/role preservados.
    const persisted = JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? 'null');
    expect(persisted).toEqual({
      ...BASE_SESSION,
      accessToken: 'access-bootstrap-novo',
      refreshToken: 'refresh-bootstrap-novo',
    });
    expect(push).not.toHaveBeenCalled();
  });

  it('access token expirado + refresh token inválido — limpa a sessão e reencaminha para /login, sem nunca mostrar conteúdo autenticado', async () => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(BASE_SESSION));
    mockFetch({
      me: [unauthorizedResponse('Token de acesso inválido ou expirado.')],
      refresh: [unauthorizedResponse('Refresh token inválido ou expirado.')],
    });

    render(
      <SessionProvider>
        <TestConsumer />
      </SessionProvider>,
    );

    await waitFor(() => expect(push).toHaveBeenCalledWith('/login'));
    expect(window.localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(screen.queryByTestId('user-email')).not.toBeInTheDocument();
  });

  it('updateTokens() mantém user/organization/role inalterados — só os tokens mudam', async () => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(BASE_SESSION));
    mockFetch({ me: [okResponse(ME_RESPONSE)] });

    render(
      <SessionProvider>
        <TestConsumer />
      </SessionProvider>,
    );
    await screen.findByTestId('user-email');

    fireEvent.click(screen.getByText('updateTokens'));

    expect(screen.getByTestId('access-token')).toHaveTextContent('access-updated');
    expect(screen.getByTestId('refresh-token')).toHaveTextContent('refresh-updated');
    expect(screen.getByTestId('user-email')).toHaveTextContent('ana@example.com');

    const persisted = JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? 'null');
    expect(persisted).toEqual({
      ...BASE_SESSION,
      accessToken: 'access-updated',
      refreshToken: 'refresh-updated',
    });
  });

  it('sessionExpired() limpa o estado React e o localStorage antes de reencaminhar — nenhum descendente volta a observar sessão autenticada', async () => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(BASE_SESSION));
    mockFetch({ me: [okResponse(ME_RESPONSE)] });

    render(
      <SessionProvider>
        <TestConsumer />
      </SessionProvider>,
    );
    await screen.findByTestId('user-email');

    fireEvent.click(screen.getByText('sessionExpired'));

    // Estado React limpo — o consumidor autenticado deixa de estar montado.
    expect(screen.queryByTestId('user-email')).not.toBeInTheDocument();
    expect(screen.queryByTestId('access-token')).not.toBeInTheDocument();
    // `localStorage` limpo.
    expect(window.localStorage.getItem(SESSION_KEY)).toBeNull();
    // Só depois o reencaminhamento.
    expect(push).toHaveBeenCalledWith('/login');
  });
});

describe('SessionProvider — correção final pós-revisão Codex (isolamento temporal + coordenação multi-tab)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    push.mockClear();
    // A cache de renovações (`lib/auth.ts`) é módulo-level, partilhada
    // por TODOS os testes deste ficheiro — vários reutilizam
    // `BASE_SESSION` (o mesmo `refreshToken`); sem limpar aqui, um
    // teste anterior que já renovou com sucesso deixaria um resultado
    // em cache que mascararia o comportamento (rede, sucesso/falha) que
    // o teste seguinte precisa de exercitar genuinamente.
    clearRefreshCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Isolamento temporal — um pedido nunca pode agir em nome de uma sessão já superada', () => {
    it('Caso A — 401 atrasado depois de logout: nunca aplica tokens renovados, nunca repete o pedido original, nunca reativa a sessão', async () => {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(BASE_SESSION));
      mockFetch({ me: [okResponse(ME_RESPONSE)] });

      let ctx: ReturnType<typeof useSession> | undefined;
      render(
        <SessionProvider>
          <TestConsumer onReady={(c) => (ctx = c)} />
        </SessionProvider>,
      );
      await waitFor(() => expect(ctx).toBeDefined());

      let resolveRefresh: (value: Response) => void = () => undefined;
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/auth/refresh')) {
          return new Promise<Response>((resolve) => {
            resolveRefresh = resolve;
          });
        }
        throw new Error(`fetch inesperado nesta fase do teste: ${url}`);
      });

      // Pedido "antigo" — 401 na primeira tentativa, arranca a renovação (pendente).
      const request = vi.fn().mockRejectedValueOnce(new ApiError('Token de acesso inválido ou expirado.', 401));
      const staleAuthFetch = ctx!.authFetch(request);

      // ANTES de a renovação terminar, a sessão é terminada (logout local).
      await act(async () => {
        ctx!.sessionExpired();
      });
      expect(window.localStorage.getItem(SESSION_KEY)).toBeNull();
      expect(push).toHaveBeenCalledWith('/login');

      // SÓ AGORA a renovação tardia termina — com sucesso, tarde demais.
      resolveRefresh(okResponse({ accessToken: 'access-late', refreshToken: 'refresh-late' }));

      await expect(staleAuthFetch).rejects.toThrow();
      // Nunca repetiu o pedido original com o token renovado — só a tentativa inicial.
      expect(request).toHaveBeenCalledTimes(1);
      // Nunca reativou a sessão (nem no `localStorage`, nem no DOM).
      expect(window.localStorage.getItem(SESSION_KEY)).toBeNull();
      expect(screen.queryByTestId('user-email')).not.toBeInTheDocument();
    });

    it('Caso B — troca de sessão: um pedido antigo que só termina depois de uma sessão nova já ter arrancado nunca afeta a sessão nova', async () => {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(BASE_SESSION));
      let resolveS1Refresh: (value: Response) => void = () => undefined;
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/auth/me')) return Promise.resolve(okResponse(ME_RESPONSE).clone());
        if (url.includes('/auth/refresh')) {
          return new Promise<Response>((resolve) => {
            resolveS1Refresh = resolve;
          });
        }
        throw new Error(`fetch inesperado: ${url}`);
      });

      let ctxS1: ReturnType<typeof useSession> | undefined;
      const { unmount } = render(
        <SessionProvider>
          <TestConsumer onReady={(c) => (ctxS1 = c)} />
        </SessionProvider>,
      );
      await waitFor(() => expect(ctxS1).toBeDefined());

      const request = vi.fn().mockRejectedValueOnce(new ApiError('Token de acesso inválido ou expirado.', 401));
      const staleAuthFetch = ctxS1!.authFetch(request);

      // S1 termina (logout) e a árvore desmonta — a navegação real para
      // `/login` (fora de `SessionProvider`, ver `app/(dashboard)/layout.tsx`)
      // desmonta sempre `SessionProvider`.
      await act(async () => {
        ctxS1!.sessionExpired();
      });
      unmount();

      // Sessão NOVA (S2) — utilizador e organização completamente diferentes.
      const SESSION_S2: Session = {
        accessToken: 'access-s2',
        refreshToken: 'refresh-s2',
        user: { id: 'user-2', email: 'bruno@example.com', name: 'Bruno' },
        organization: { id: 'org-2', name: 'Beta', slug: 'beta' },
        role: 'OWNER',
      };
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION_S2));
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve(
            okResponse({
              user: SESSION_S2.user,
              organization: SESSION_S2.organization,
              role: SESSION_S2.role,
              isSuperAdmin: false,
            }).clone(),
          );
        }
        if (url.includes('/auth/refresh')) {
          return new Promise<Response>((resolve) => {
            resolveS1Refresh = resolve;
          });
        }
        throw new Error(`fetch inesperado: ${url}`);
      });

      let ctxS2: ReturnType<typeof useSession> | undefined;
      render(
        <SessionProvider>
          <TestConsumer onReady={(c) => (ctxS2 = c)} />
        </SessionProvider>,
      );
      await waitFor(() => expect(ctxS2?.session.accessToken).toBe('access-s2'));

      // SÓ AGORA a renovação tardia de S1 termina, com sucesso.
      resolveS1Refresh(okResponse({ accessToken: 'access-s1-late', refreshToken: 'refresh-s1-late' }));
      await expect(staleAuthFetch).rejects.toThrow();
      expect(request).toHaveBeenCalledTimes(1);

      // A sessão persistida e a de S2 continuam intocadas — nunca contaminadas por S1.
      const persisted = JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? 'null');
      expect(persisted).toEqual(SESSION_S2);
      expect(ctxS2!.session.accessToken).toBe('access-s2');
      expect(ctxS2!.session.refreshToken).toBe('refresh-s2');
    });

    it('nunca cria um ciclo — a geração muda uma única vez por terminação, StaleSessionError propaga sem qualquer nova tentativa de rede', async () => {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(BASE_SESSION));
      mockFetch({ me: [okResponse(ME_RESPONSE)] });

      let ctx: ReturnType<typeof useSession> | undefined;
      render(
        <SessionProvider>
          <TestConsumer onReady={(c) => (ctx = c)} />
        </SessionProvider>,
      );
      await waitFor(() => expect(ctx).toBeDefined());

      const fetchSpy = vi.fn().mockResolvedValue(okResponse({ accessToken: 'a', refreshToken: 'r' }));
      global.fetch = fetchSpy;

      await act(async () => {
        ctx!.sessionExpired();
      });

      // `sessionRef` já é `null` — `authFetch()` rejeita de imediato, sem
      // sequer tentar `request()` uma única vez.
      const request = vi.fn();
      await expect(ctx!.authFetch(request)).rejects.toThrow();
      expect(request).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('Coordenação multi-tab (evento `storage` sobre `localStorage`, nunca `BroadcastChannel`)', () => {
    /**
     * Devolve um "handle" com uma propriedade `current` sempre LIVE (nunca
     * uma cópia estática) — `ctx` (o valor de `useSession()`) é
     * recriado a cada render de `SessionProvider`; ler `ctx.session`
     * diretamente capturaria só o valor do momento em que a tab
     * arrancou, nunca refletindo uma atualização posterior (renovação
     * local ou propagada por outra tab). Chamar MÉTODOS do valor antigo
     * (`authFetch`/`sessionExpired`/`updateTokens`) já funciona
     * corretamente mesmo com uma referência desatualizada — todos leem
     * sempre `sessionRef`/`generationRef` (refs, sempre atuais) — só a
     * LEITURA direta de propriedades (`ctx.session.accessToken`)
     * precisa desta indireção.
     */
    interface TabHandle {
      readonly current: ReturnType<typeof useSession>;
    }

    async function renderTab(): Promise<TabHandle> {
      let latest: ReturnType<typeof useSession> | undefined;
      render(
        <SessionProvider>
          <TestConsumer onReady={(c) => (latest = c)} />
        </SessionProvider>,
      );
      await waitFor(() => expect(latest).toBeDefined());
      return {
        get current() {
          return latest!;
        },
      };
    }

    it('renovação numa tab propaga sessionRef/state/localStorage para outra tab — mesmo sem esta fazer pedido nenhum', async () => {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(BASE_SESSION));
      mockFetch({ me: [okResponse(ME_RESPONSE), okResponse(ME_RESPONSE)] });

      const tabA = await renderTab();
      const tabB = await renderTab();

      act(() => {
        tabA.current.updateTokens({ accessToken: 'access-from-a', refreshToken: 'refresh-from-a' });
      });
      expect(tabA.current.session.accessToken).toBe('access-from-a');

      act(() => {
        dispatchStorage(BASE_SESSION, { ...BASE_SESSION, accessToken: 'access-from-a', refreshToken: 'refresh-from-a' });
      });

      expect(tabB.current.session.accessToken).toBe('access-from-a');
      expect(tabB.current.session.refreshToken).toBe('refresh-from-a');
      // `localStorage` continua consistente (só A escreveu; B nunca reescreve o que recebe).
      const persisted = JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? 'null');
      expect(persisted.accessToken).toBe('access-from-a');
    });

    it('só uma tab chama /auth/refresh — a outra, atrasada, nunca precisa de uma segunda chamada de rede', async () => {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(BASE_SESSION));
      mockFetch({ me: [okResponse(ME_RESPONSE), okResponse(ME_RESPONSE)] });

      const tabA = await renderTab();
      const tabB = await renderTab();

      let resolveRefresh: (value: Response) => void = () => undefined;
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/auth/refresh')) {
          return new Promise<Response>((resolve) => {
            resolveRefresh = resolve;
          });
        }
        throw new Error(`fetch inesperado: ${url}`);
      });

      const requestA = vi
        .fn()
        .mockRejectedValueOnce(new ApiError('Token de acesso inválido ou expirado.', 401))
        .mockResolvedValueOnce('resultado-A');
      const promiseA = tabA.current.authFetch(requestA);

      // Espera a cadeia assíncrona chegar mesmo à chamada de rede (o
      // `request()` inicial ainda tem de rejeitar, e o `await` disso
      // ainda tem de ceder ao microtask queue) antes de resolver — sem
      // isto, `resolveRefresh` continuaria a apontar para o placeholder
      // inicial, nunca para o resolver real, e a promessa ficaria
      // pendente para sempre (achado real ao escrever este teste).
      await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/refresh'), expect.anything()));
      resolveRefresh(okResponse({ accessToken: 'access-from-a', refreshToken: 'refresh-from-a' }));
      await expect(promiseA).resolves.toBe('resultado-A');
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => String(c[0]).includes('/auth/refresh'))).toHaveLength(1);

      // Só agora chega a B o evento que o browser entregaria noutra tab —
      // propaga o `sessionRef` de B de imediato (é exatamente isto que a
      // Secção 4 pede: uma tab idle fica sincronizada mesmo sem fazer
      // pedido nenhum), por isso o pedido de B abaixo pode já nem
      // precisar de 401 nenhum — só interessa que NUNCA dispara uma
      // segunda chamada a `/auth/refresh` nem termina a sessão,
      // independentemente de qual dos dois casos acontece.
      act(() => {
        dispatchStorage(BASE_SESSION, { ...BASE_SESSION, accessToken: 'access-from-a', refreshToken: 'refresh-from-a' });
      });

      const requestB = vi.fn().mockImplementation(async (token: string) => {
        if (token === 'access-original') {
          throw new ApiError('Token de acesso inválido ou expirado.', 401);
        }
        return 'resultado-B';
      });
      const resultB = await tabB.current.authFetch(requestB);

      expect(resultB).toBe('resultado-B');
      expect(push).not.toHaveBeenCalled();
      // Nenhuma chamada de rede ADICIONAL a `/auth/refresh` — B nunca
      // precisou de renovar sozinho (já estava sincronizado, ou
      // reutilizou o resultado publicado por A).
      const totalRefreshCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) =>
        String(c[0]).includes('/auth/refresh'),
      ).length;
      expect(totalRefreshCalls).toBe(1);
    });

    it('refresh falhado numa tab, com a outra já renovada entretanto, recupera via resultado externo — nunca limpa a sessão válida', async () => {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(BASE_SESSION));
      mockFetch({ me: [okResponse(ME_RESPONSE), okResponse(ME_RESPONSE)] });

      const tabB = await renderTab();

      let resolveBRefresh: (value: Response) => void = () => undefined;
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/auth/refresh')) {
          return new Promise<Response>((resolve) => {
            resolveBRefresh = resolve;
          });
        }
        throw new Error(`fetch inesperado: ${url}`);
      });

      const requestB = vi
        .fn()
        .mockRejectedValueOnce(new ApiError('Token de acesso inválido ou expirado.', 401))
        .mockResolvedValueOnce('resultado-B');
      const promiseB = tabB.current.authFetch(requestB);

      // Espera o pedido de rede PRÓPRIO de B (a `/auth/refresh`) ter
      // mesmo arrancado — só depois faz sentido dizer que está
      // "pendente" quando o evento de A chega. Sem esperar aqui, o
      // evento de A podia chegar cedo demais e a cache externa resolvia
      // tudo antes de B sequer tentar a sua própria chamada de rede —
      // um teste que passaria por acidente, sem exercitar a recuperação
      // depois de uma falha PRÓPRIA (achado real ao escrever este teste).
      await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/refresh'), expect.anything()));

      // ENQUANTO o pedido de rede PRÓPRIO de B está pendente, chega o
      // evento de A (já renovou com sucesso, noutra tab).
      act(() => {
        dispatchStorage(BASE_SESSION, { ...BASE_SESSION, accessToken: 'access-from-a', refreshToken: 'refresh-from-a' });
      });

      // SÓ AGORA o pedido de rede PRÓPRIO de B (tardio) resolve com FALHA
      // (401 — o `refreshToken` já tinha sido rodado por A).
      resolveBRefresh(unauthorizedResponse('Refresh token inválido.'));

      const resultB = await promiseB;
      expect(resultB).toBe('resultado-B');
      // Nunca terminou a sessão por causa da falha PRÓPRIA — recuperou via o resultado externo.
      expect(push).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(SESSION_KEY)).not.toBeNull();
    });

    it('logout numa tab termina a outra — evento storage de remoção propaga o fim de sessão', async () => {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(BASE_SESSION));
      mockFetch({ me: [okResponse(ME_RESPONSE), okResponse(ME_RESPONSE)] });

      const tabA = await renderTab();
      await renderTab();

      act(() => {
        tabA.current.sessionExpired();
      });
      expect(push).toHaveBeenCalledTimes(1);

      act(() => {
        dispatchStorage(BASE_SESSION, null);
      });

      // Ambas as tabs reencaminharam para `/login` — a terminação propagou-se.
      expect(push).toHaveBeenCalledTimes(2);
      expect(push).toHaveBeenNthCalledWith(1, '/login');
      expect(push).toHaveBeenNthCalledWith(2, '/login');
    });

    it('uma tab que já não tem sessão ativa ignora um evento de renovação sem `oldValue` reconhecível (nunca revive sozinha)', async () => {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(BASE_SESSION));
      mockFetch({ me: [okResponse(ME_RESPONSE)] });

      const tabA = await renderTab();
      act(() => {
        tabA.current.sessionExpired();
      });
      expect(push).toHaveBeenCalledTimes(1);

      // Uma escrita de sessão nova (login noutra tab) chega sem
      // `oldValue` reconhecível para esta tab (já sem sessão) — nunca
      // deve reativar-se sozinha.
      const NEW_LOGIN: Session = {
        accessToken: 'access-new-login',
        refreshToken: 'refresh-new-login',
        user: { id: 'user-3', email: 'carla@example.com', name: 'Carla' },
        organization: { id: 'org-3', name: 'Gamma', slug: 'gamma' },
        role: 'MEMBER',
      };
      act(() => {
        dispatchStorage(null, NEW_LOGIN);
      });

      // Nenhum novo reencaminhamento nem reativação — só o clique original.
      expect(push).toHaveBeenCalledTimes(1);
    });

    /**
     * Correção pós-revisão Codex (Finding 1) — a versão ANTERIOR deste
     * teste (regressão real) só verificava que a tab antiga terminava,
     * nunca que `localStorage` sobrevivia — `terminateLocally()` incluía
     * sempre `clearSession()`, apagando a sessão S2 legítima que a OUTRA
     * tab acabara de escrever. Cada teste abaixo escreve S2 em
     * `localStorage` ANTES de disparar o evento (exatamente a ordem real
     * — a outra tab escreve primeiro, só depois o evento `storage`
     * chega), e confirma explicitamente: (a) `localStorage` continua com
     * S2 INTEGRALMENTE depois da reação; (b) a tab que reagiu nunca
     * chamou `setItem`/`removeItem` (nenhum segundo storage/remove); (c)
     * uma nova instância que bootstrapa a seguir lê S2 corretamente — a
     * prova disponível, dentro das limitações de uma única `window` de
     * teste, de que "a tab que originou S2 continua autenticada".
     */
    it('troca direta de identidade S1 → S2 (user.id diferente) — nunca apaga a sessão nova, nunca escreve em localStorage; a tab que criou S2 continua autenticada', async () => {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(BASE_SESSION));
      mockFetch({ me: [okResponse(ME_RESPONSE)] });

      const tabA = await renderTab();
      expect(tabA.current.session.user.id).toBe(BASE_SESSION.user.id);

      const SESSION_S2: Session = {
        accessToken: 'access-s2-direto',
        refreshToken: 'refresh-s2-direto',
        user: { id: 'user-diferente', email: 'diferente@example.com', name: 'Diferente' },
        organization: BASE_SESSION.organization,
        role: 'MEMBER',
      };

      // A OUTRA tab já escreveu S2 em `localStorage` — exatamente a
      // ordem real (a escrita acontece antes de o evento `storage`
      // chegar a A).
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION_S2));

      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
      const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem');

      act(() => {
        dispatchStorage(BASE_SESSION, SESSION_S2);
      });

      // A tab A invalidou-se a si própria (S1) — reencaminha para /login.
      expect(push).toHaveBeenCalledWith('/login');
      expect(screen.queryByTestId('user-email')).not.toBeInTheDocument();

      // `localStorage` continua a conter S2 INTEGRALMENTE — nunca
      // apagado nem reescrito por cima pela tab que reagiu ao evento.
      expect(JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? 'null')).toEqual(SESSION_S2);
      // Nenhum segundo storage/remove provocado pela reação de A.
      expect(removeItemSpy).not.toHaveBeenCalled();
      expect(setItemSpy).not.toHaveBeenCalled();

      setItemSpy.mockRestore();
      removeItemSpy.mockRestore();

      // A tab que criou S2 continua autenticada — uma instância nova que
      // bootstrapa agora lê S2 corretamente.
      mockFetch({
        me: [
          okResponse({
            user: SESSION_S2.user,
            organization: SESSION_S2.organization,
            role: SESSION_S2.role,
            isSuperAdmin: false,
          }),
        ],
      });
      const tabWithS2 = await renderTab();
      expect(tabWithS2.current.session.accessToken).toBe('access-s2-direto');
      expect(tabWithS2.current.session.user.id).toBe('user-diferente');
    });

    it('troca direta de identidade S1 → S2 (organization.id diferente, mesmo user.id) — nunca apaga a sessão nova, nunca escreve em localStorage; a tab que criou S2 continua autenticada', async () => {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(BASE_SESSION));
      mockFetch({ me: [okResponse(ME_RESPONSE)] });

      const tabA = await renderTab();
      expect(tabA.current.session.organization.id).toBe(BASE_SESSION.organization.id);

      const SESSION_OUTRA_ORG: Session = {
        accessToken: 'access-outra-org',
        refreshToken: 'refresh-outra-org',
        user: BASE_SESSION.user,
        organization: { id: 'org-diferente', name: 'Outra Organização', slug: 'outra-organizacao' },
        role: 'OWNER',
      };

      window.localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION_OUTRA_ORG));

      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
      const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem');

      act(() => {
        dispatchStorage(BASE_SESSION, SESSION_OUTRA_ORG);
      });

      expect(push).toHaveBeenCalledWith('/login');
      expect(screen.queryByTestId('user-email')).not.toBeInTheDocument();

      expect(JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? 'null')).toEqual(SESSION_OUTRA_ORG);
      expect(removeItemSpy).not.toHaveBeenCalled();
      expect(setItemSpy).not.toHaveBeenCalled();

      setItemSpy.mockRestore();
      removeItemSpy.mockRestore();

      mockFetch({
        me: [
          okResponse({
            user: SESSION_OUTRA_ORG.user,
            organization: SESSION_OUTRA_ORG.organization,
            role: SESSION_OUTRA_ORG.role,
            isSuperAdmin: false,
          }),
        ],
      });
      const tabWithS2 = await renderTab();
      expect(tabWithS2.current.session.accessToken).toBe('access-outra-org');
      expect(tabWithS2.current.session.organization.id).toBe('org-diferente');
    });
  });
});

/**
 * Correção pós-revisão Codex, Secções 2/4/5 — lifecycle completo. Uma
 * resposta assíncrona (bootstrap ou `authFetch()`) que só termina DEPOIS
 * de a instância de `SessionProvider` já ter deixado de ser válida
 * (desmontada fisicamente, ou terminada/substituída logicamente por um
 * evento de outra tab) nunca deve produzir efeitos secundários — nem
 * `setState`, nem `saveSession`/`localStorage`, nem repetir o pedido
 * original. Todos os testes abaixo controlam manualmente o momento exato
 * em que a resposta de rede chega, sempre DEPOIS do evento de
 * invalidação, para provar a ordem exata exigida pelos achados.
 */
describe('SessionProvider — lifecycle completo (bootstrap e authFetch nunca sobrevivem à sua própria invalidação)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    push.mockClear();
    clearRefreshCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logout durante bootstrap (evento storage de outra tab) — a resposta tardia de /auth/me nunca ressuscita a sessão já terminada', async () => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(BASE_SESSION));
    let resolveMe: (value: Response) => void = () => undefined;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/me')) {
        return new Promise<Response>((resolve) => {
          resolveMe = resolve;
        });
      }
      throw new Error(`fetch inesperado: ${url}`);
    });

    render(
      <SessionProvider>
        <TestConsumer />
      </SessionProvider>,
    );

    // Bootstrap ainda pendente — /auth/me nunca respondeu.
    expect(screen.queryByTestId('user-email')).not.toBeInTheDocument();

    // Logout noutra tab, ANTES de o bootstrap terminar.
    act(() => {
      dispatchStorage(BASE_SESSION, null);
    });
    expect(push).toHaveBeenCalledWith('/login');
    expect(window.localStorage.getItem(SESSION_KEY)).toBeNull();

    // SÓ AGORA o bootstrap termina, com sucesso — tarde demais.
    await act(async () => {
      resolveMe(okResponse(ME_RESPONSE));
      await Promise.resolve();
    });

    // Nunca restaura estado nem reescreve localStorage — o
    // redirecionamento já efetuado permanece a única ação.
    expect(window.localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(screen.queryByTestId('user-email')).not.toBeInTheDocument();
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('unmount durante bootstrap (com renovação pendente) — resposta tardia nunca grava tokens novos nem restaura estado', async () => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(BASE_SESSION));
    let resolveRefresh: (value: Response) => void = () => undefined;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/me')) {
        return Promise.resolve(unauthorizedResponse('Token de acesso inválido ou expirado.'));
      }
      if (url.includes('/auth/refresh')) {
        return new Promise<Response>((resolve) => {
          resolveRefresh = resolve;
        });
      }
      throw new Error(`fetch inesperado: ${url}`);
    });

    const { unmount } = render(
      <SessionProvider>
        <TestConsumer />
      </SessionProvider>,
    );

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/refresh'), expect.anything()),
    );

    unmount();

    await act(async () => {
      resolveRefresh(okResponse({ accessToken: 'access-late-boot', refreshToken: 'refresh-late-boot' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    // A sessão em localStorage continua EXATAMENTE a original — a
    // renovação tardia, depois do desmonte, nunca chegou a gravar nada.
    expect(JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? 'null')).toEqual(BASE_SESSION);
    expect(push).not.toHaveBeenCalled();
  });

  it('authFetch durante unmount — renovação tardia nunca aplica tokens, nunca repete o pedido original, nunca escreve localStorage', async () => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(BASE_SESSION));
    mockFetch({ me: [okResponse(ME_RESPONSE)] });

    let ctx: ReturnType<typeof useSession> | undefined;
    const { unmount } = render(
      <SessionProvider>
        <TestConsumer onReady={(c) => (ctx = c)} />
      </SessionProvider>,
    );
    await waitFor(() => expect(ctx).toBeDefined());

    let resolveRefresh: (value: Response) => void = () => undefined;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/refresh')) {
        return new Promise<Response>((resolve) => {
          resolveRefresh = resolve;
        });
      }
      throw new Error(`fetch inesperado nesta fase do teste: ${url}`);
    });

    const request = vi.fn().mockRejectedValueOnce(new ApiError('Token de acesso inválido ou expirado.', 401));
    const pending = ctx!.authFetch(request);

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/refresh'), expect.anything()),
    );

    unmount();

    resolveRefresh(okResponse({ accessToken: 'access-late-fetch', refreshToken: 'refresh-late-fetch' }));

    await expect(pending).rejects.toThrow();
    // Nunca repetiu o pedido original com o token renovado — só a tentativa inicial.
    expect(request).toHaveBeenCalledTimes(1);
    // Nunca gravou os tokens renovados em localStorage — a sessão continua exatamente a original.
    expect(JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? 'null')).toEqual(BASE_SESSION);
  });
});

/**
 * Correção pós-revisão Codex (Finding 2) — `React.StrictMode` de
 * desenvolvimento corre cada efeito duas vezes (setup→cleanup→setup).
 * Antes da correção, `instanceRef.current.mounted` era um boolean
 * partilhado sem identidade de execução: o cleanup do PRIMEIRO setup
 * deixava-o `false` para sempre, e o SEGUNDO setup (o que realmente
 * persiste) nunca o repunha — `isOperationStillCurrent()` passava a
 * devolver sempre `false`, prendendo o bootstrap (e qualquer
 * `authFetch` seguinte) no spinner indefinidamente, mesmo com o
 * `SessionProvider` genuinamente montado.
 */
describe('SessionProvider — React StrictMode (Finding 2, pós-revisão Codex: setup→cleanup→setup nunca fica preso)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    push.mockClear();
    clearRefreshCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('bootstrap simples sob StrictMode termina normalmente — nunca fica preso no spinner', async () => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(BASE_SESSION));
    // StrictMode pode correr o efeito de bootstrap duas vezes — a fila
    // aguenta ambas as execuções, quantas quer que realmente ocorram.
    mockFetch({ me: [okResponse(ME_RESPONSE), okResponse(ME_RESPONSE)] });

    render(
      <StrictMode>
        <SessionProvider>
          <TestConsumer />
        </SessionProvider>
      </StrictMode>,
    );

    expect(await screen.findByTestId('user-email')).toHaveTextContent('ana@example.com');
    expect(push).not.toHaveBeenCalled();
  });

  it('renovação durante bootstrap sob StrictMode termina normalmente e persiste os tokens novos', async () => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(BASE_SESSION));

    // StrictMode corre o efeito de bootstrap duas vezes; as DUAS
    // execuções chamam `fetch()` de forma entrelaçada (nunca uma
    // execução completa isolada antes da outra começar), por isso uma
    // fila fixa por posição não reflete a ordem real das chamadas — a
    // resposta tem de depender do TOKEN usado, exatamente como o
    // backend real decidiria, nunca da ordem de invocação.
    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/auth/me')) {
        const authorization = (options?.headers as Record<string, string> | undefined)?.Authorization ?? '';
        if (authorization.includes('access-strict-novo')) {
          return Promise.resolve(okResponse(ME_RESPONSE));
        }
        return Promise.resolve(unauthorizedResponse('Token de acesso inválido ou expirado.'));
      }
      if (url.includes('/auth/refresh')) {
        return Promise.resolve(
          okResponse({ accessToken: 'access-strict-novo', refreshToken: 'refresh-strict-novo' }),
        );
      }
      throw new Error(`fetch inesperado: ${url}`);
    });

    render(
      <StrictMode>
        <SessionProvider>
          <TestConsumer />
        </SessionProvider>
      </StrictMode>,
    );

    expect(await screen.findByTestId('user-email')).toHaveTextContent('ana@example.com');
    expect(push).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(SESSION_KEY)).not.toBeNull();
  });

  it('depois do ciclo setup→cleanup→setup do StrictMode, authFetch continua a funcionar — a instância corrente nunca fica presa como "desmontada"', async () => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(BASE_SESSION));
    mockFetch({ me: [okResponse(ME_RESPONSE), okResponse(ME_RESPONSE)] });

    let ctx: ReturnType<typeof useSession> | undefined;
    render(
      <StrictMode>
        <SessionProvider>
          <TestConsumer onReady={(c) => (ctx = c)} />
        </SessionProvider>
      </StrictMode>,
    );
    await waitFor(() => expect(ctx).toBeDefined());

    // Um `authFetch()` novo, DEPOIS de o StrictMode já ter corrido
    // setup→cleanup→setup, tem de continuar a funcionar normalmente — se
    // `mounted` tivesse ficado preso em `false` pelo cleanup do PRIMEIRO
    // setup, isto rejeitaria sempre com `StaleSessionError`.
    const request = vi.fn().mockResolvedValue('resultado-pos-strict');
    const result = await ctx!.authFetch(request);
    expect(result).toBe('resultado-pos-strict');
    expect(request).toHaveBeenCalledTimes(1);
  });
});

/**
 * Correção pós-revisão Codex (Finding 3) — `logout()` tinha de invalidar
 * tudo localmente ANTES de sequer tentar `POST /auth/logout`, nunca
 * depois. Com a ordem antiga, uma renovação pendente que terminasse
 * DURANTE o `await` do pedido de logout podia aplicar tokens novos,
 * repetir o pedido original, ou concluir uma operação já depois de o
 * utilizador ter pedido para terminar sessão.
 */
describe('SessionProvider — logout() invalida localmente antes da chamada remota (Finding 3, pós-revisão Codex)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    push.mockClear();
    clearRefreshCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logout com refresh pendente concorrente: a renovação tardia nunca aplica tokens, nunca repete o pedido, nunca escreve localStorage — só depois /auth/logout termina', async () => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(BASE_SESSION));
    mockFetch({ me: [okResponse(ME_RESPONSE)] });

    let ctx: ReturnType<typeof useSession> | undefined;
    render(
      <SessionProvider>
        <TestConsumer onReady={(c) => (ctx = c)} />
      </SessionProvider>,
    );
    await waitFor(() => expect(ctx).toBeDefined());

    let resolveRefresh: (value: Response) => void = () => undefined;
    let resolveLogout: (value: Response) => void = () => undefined;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/refresh')) {
        return new Promise<Response>((resolve) => {
          resolveRefresh = resolve;
        });
      }
      if (url.includes('/auth/logout')) {
        return new Promise<Response>((resolve) => {
          resolveLogout = resolve;
        });
      }
      throw new Error(`fetch inesperado nesta fase do teste: ${url}`);
    });

    // 1-2: sessão ativa; `authFetch` entra em refresh pendente.
    const request = vi.fn().mockRejectedValueOnce(new ApiError('Token de acesso inválido ou expirado.', 401));
    const pendingAuthFetch = ctx!.authFetch(request);
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/refresh'), expect.anything()),
    );

    // 3-4: o utilizador chama logout — `/auth/logout` fica pendente.
    let logoutPromise!: Promise<void>;
    act(() => {
      logoutPromise = ctx!.logout();
    });
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/logout'), expect.anything()),
    );

    // A invalidação local já aconteceu de imediato — estado React já
    // limpo antes mesmo de `/auth/logout` terminar.
    expect(screen.queryByTestId('user-email')).not.toBeInTheDocument();

    // 5: o refresh pendente termina DURANTE o intervalo em que
    // `/auth/logout` ainda está pendente.
    resolveRefresh(okResponse({ accessToken: 'access-logout-tardio', refreshToken: 'refresh-logout-tardio' }));

    // 6: NÃO pode ocorrer updateTokens/saveSession/retry — o pedido
    // original nunca é repetido.
    await expect(pendingAuthFetch).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);

    // 7: só depois `/auth/logout` termina.
    resolveLogout(okResponse({}));
    await act(async () => {
      await logoutPromise;
    });

    // 8: a sessão continua terminada — nunca escreveu os tokens
    // renovados tardios em localStorage.
    expect(window.localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(push).toHaveBeenCalledWith('/login');
  });

  it('logout remoto falhado (erro de rede em /auth/logout) — a sessão local continua terminada, nunca é restaurada', async () => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(BASE_SESSION));
    mockFetch({ me: [okResponse(ME_RESPONSE)] });

    let ctx: ReturnType<typeof useSession> | undefined;
    render(
      <SessionProvider>
        <TestConsumer onReady={(c) => (ctx = c)} />
      </SessionProvider>,
    );
    await waitFor(() => expect(ctx).toBeDefined());

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/logout')) {
        return Promise.reject(new Error('Falha de rede.'));
      }
      throw new Error(`fetch inesperado: ${url}`);
    });

    await act(async () => {
      await ctx!.logout();
    });

    // A falha do logout remoto nunca reativa a sessão — continua
    // terminada e reencaminhada, exatamente como um logout bem-sucedido.
    expect(window.localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(screen.queryByTestId('user-email')).not.toBeInTheDocument();
    expect(push).toHaveBeenCalledWith('/login');
  });
});

/**
 * Correção final pós-revisão Codex — isolamento entre epochs do
 * bootstrap em `React.StrictMode`. `isOperationStillCurrent()` verificava
 * só `mounted`/`generation`; nenhum dos dois distingue DUAS execuções do
 * efeito de bootstrap que se sobrepõem (setup A → cleanup A → setup B,
 * sem que A alguma vez termine antes de B arrancar) — assim que B
 * arranca, `mounted` volta a `true` e `generation` continua a mesma, e
 * um callback TARDIO de A voltava a parecer "corrente". Cada teste
 * abaixo controla manualmente a ordem de resolução das chamadas de rede
 * de A e de B (nunca a ordem de invocação, que o StrictMode já decide
 * por si — A invoca sempre primeiro), com respostas DIFERENTES entre A
 * e B — nunca dados iguais, que mascarariam um teste que passasse por
 * acidente mesmo sem isolamento real.
 */
describe('SessionProvider — StrictMode: isolamento entre epochs do bootstrap (correção final pós-revisão Codex)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    push.mockClear();
    clearRefreshCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Caso 1 — A termina depois de B com resultado diferente: o resultado de A nunca substitui state/sessionRef/localStorage já instalados por B', async () => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(BASE_SESSION));

    const meDeferreds: Array<{ resolve: (value: Response) => void }> = [];
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/me')) {
        return new Promise<Response>((resolve) => {
          meDeferreds.push({ resolve });
        });
      }
      throw new Error(`fetch inesperado: ${url}`);
    });

    render(
      <StrictMode>
        <SessionProvider>
          <TestConsumer />
        </SessionProvider>
      </StrictMode>,
    );

    // Duas execuções do efeito (setup A, setup B) — cada uma já disparou
    // a sua própria chamada a `/auth/me`, ambas ainda pendentes.
    // `meDeferreds[0]` é sempre A (invoca primeiro); `meDeferreds[1]` é
    // sempre B (a execução que persiste).
    await waitFor(() => expect(meDeferreds.length).toBe(2));

    const ME_B = {
      user: { id: 'user-b', email: 'b@example.com', name: 'Sessão B' },
      organization: BASE_SESSION.organization,
      role: 'MEMBER',
      isSuperAdmin: false,
    };
    const ME_A_TARDIO = {
      user: { id: 'user-a-tardio', email: 'a-tardio@example.com', name: 'Sessão A tardia' },
      organization: BASE_SESSION.organization,
      role: 'OWNER',
      isSuperAdmin: false,
    };

    // 5. Setup B termina com sucesso e instala a sua sessão.
    await act(async () => {
      meDeferreds[1].resolve(okResponse(ME_B));
    });
    expect(await screen.findByTestId('user-email')).toHaveTextContent('b@example.com');

    // 6. Só DEPOIS o bootstrap de A (já substituído) termina — com uma
    // resposta DIFERENTE da de B.
    await act(async () => {
      meDeferreds[0].resolve(okResponse(ME_A_TARDIO));
      await Promise.resolve();
    });

    // 7-8. O resultado de A nunca substitui o `state` (o `me` mostrado
    // continua a ser o de B) — a sessão final continua a ser a de B. Um
    // bootstrap bem-sucedido sem renovação nunca escreve em
    // `localStorage` (só `onTokensRefreshed` o faz) — confirma-se aqui
    // que continua exatamente a sessão original persistida, nunca
    // reescrita por A nem por B.
    expect(screen.getByTestId('user-email')).toHaveTextContent('b@example.com');
    expect(screen.queryByTestId('user-email')).not.toHaveTextContent('a-tardio@example.com');
    const persisted = JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? 'null');
    expect(persisted).toEqual(BASE_SESSION);
    expect(push).not.toHaveBeenCalled();
  });

  it('Caso 2 — B tem sucesso, A falha depois: a falha tardia de A nunca limpa localStorage, nunca limpa state, nunca redireciona para login', async () => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(BASE_SESSION));

    const meDeferreds: Array<{ resolve: (value: Response) => void; reject: (reason: unknown) => void }> = [];
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/me')) {
        return new Promise<Response>((resolve, reject) => {
          meDeferreds.push({ resolve, reject });
        });
      }
      throw new Error(`fetch inesperado: ${url}`);
    });

    render(
      <StrictMode>
        <SessionProvider>
          <TestConsumer />
        </SessionProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(meDeferreds.length).toBe(2));

    // 3-4. B (2ª execução, a que persiste) tem sucesso — conteúdo
    // autenticado aparece.
    await act(async () => {
      meDeferreds[1].resolve(okResponse(ME_RESPONSE));
    });
    expect(await screen.findByTestId('user-email')).toHaveTextContent('ana@example.com');

    // 5. Depois A (1ª execução, já substituída) falha — erro de rede
    // direto, nunca sequer chega a tentar renovar.
    await act(async () => {
      meDeferreds[0].reject(new Error('Erro de rede tardio — setup A, já substituído por B.'));
      await Promise.resolve();
    });

    // 6-7. A falha de A nunca limpa localStorage, nunca limpa state,
    // nunca redireciona — a sessão de B permanece ativa.
    expect(window.localStorage.getItem(SESSION_KEY)).not.toBeNull();
    expect(screen.getByTestId('user-email')).toHaveTextContent('ana@example.com');
    expect(push).not.toHaveBeenCalled();
  });

  it('Caso 3 — refresh antigo de A termina depois de B: tokens tardios de A nunca são persistidos nem aplicados', async () => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(BASE_SESSION));

    const meDeferreds: Array<{ resolve: (value: Response) => void }> = [];
    const refreshDeferreds: Array<{ resolve: (value: Response) => void }> = [];
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/me')) {
        return new Promise<Response>((resolve) => {
          meDeferreds.push({ resolve });
        });
      }
      if (url.includes('/auth/refresh')) {
        return new Promise<Response>((resolve) => {
          refreshDeferreds.push({ resolve });
        });
      }
      throw new Error(`fetch inesperado: ${url}`);
    });

    render(
      <StrictMode>
        <SessionProvider>
          <TestConsumer />
        </SessionProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(meDeferreds.length).toBe(2));

    // A (1ª execução) recebe 401 — entra em renovação.
    await act(async () => {
      meDeferreds[0].resolve(unauthorizedResponse('Token de acesso inválido ou expirado.'));
    });
    await waitFor(() => expect(refreshDeferreds.length).toBe(1));

    // B (2ª execução, a que persiste) tem sucesso direto, sem precisar
    // de renovar — estabelece a sessão válida.
    await act(async () => {
      meDeferreds[1].resolve(okResponse(ME_RESPONSE));
    });
    expect(await screen.findByTestId('user-email')).toHaveTextContent('ana@example.com');
    expect(screen.getByTestId('access-token')).toHaveTextContent('access-original');

    // Só DEPOIS o refresh tardio de A (já substituído) termina — com
    // tokens DIFERENTES dos que B está a usar.
    await act(async () => {
      refreshDeferreds[0].resolve(
        okResponse({ accessToken: 'access-a-tardio', refreshToken: 'refresh-a-tardio' }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    // Os tokens de A nunca são persistidos nem aplicados — a sessão
    // continua a de B, inalterada.
    expect(screen.getByTestId('access-token')).toHaveTextContent('access-original');
    const persisted = JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? 'null');
    expect(persisted.accessToken).toBe('access-original');
    expect(persisted.accessToken).not.toBe('access-a-tardio');
    expect(push).not.toHaveBeenCalled();
  });
});
