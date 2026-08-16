import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  withAuthRetry,
  SessionExpiredError,
  recordExternalRefresh,
  clearRefreshCache,
  createIsolatedRefreshCoordinator,
  EXTERNAL_REFRESH_WAIT_MS,
} from './auth';
import { ApiError } from './api';

/**
 * `withAuthRetry()` é a peça central do hardening de sessão (bug real:
 * "Token de acesso inválido ou expirado." durante edição/guarda de
 * formulários, mesmo com sessão visualmente ativa) — só o `fetch`
 * global (o pedido de rede a `/auth/refresh`) é mockado, nunca
 * `refreshSession()`, para exercitar a lógica de retry real.
 *
 * A cache de renovações (`refreshesByToken`, `lib/auth.ts`) é indexada
 * pelo `refreshToken` e NUNCA limpa no sucesso (correção final
 * pós-revisão Codex — é exatamente essa limpeza prematura que causava a
 * race do 401 atrasado) — por isso cada teste usa sempre um
 * `refreshToken` distinto de qualquer outro teste deste ficheiro, nunca
 * reaproveitado, para nenhum teste "herdar" por acidente uma renovação
 * já resolvida por um teste anterior (o próprio módulo `lib/auth.ts` é
 * partilhado entre todos os `it()` deste ficheiro).
 */
describe('withAuthRetry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sem 401, chama request() uma única vez e nunca tenta renovar', async () => {
    const request = vi.fn().mockResolvedValue('ok');
    global.fetch = vi.fn();
    const onTokensRefreshed = vi.fn();

    const result = await withAuthRetry('token-sem-401', 'refresh-sem-401', request, onTokensRefreshed);

    expect(result).toBe('ok');
    expect(request).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(onTokensRefreshed).not.toHaveBeenCalled();
  });

  it('erro que não é 401 propaga tal e qual, sem tentar renovar', async () => {
    const request = vi.fn().mockRejectedValue(new ApiError('Fornecedor não encontrado.', 404));
    global.fetch = vi.fn();

    await expect(
      withAuthRetry('token-404', 'refresh-404', request, vi.fn()),
    ).rejects.toThrow('Fornecedor não encontrado.');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('401 renova a sessão uma única vez e repete o pedido original exatamente uma vez com o token novo', async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('Token de acesso inválido ou expirado.', 401))
      .mockResolvedValueOnce('resultado-final');
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accessToken: 'token-renovado-1', refreshToken: 'refresh-renovado-1' }), {
        status: 200,
      }),
    );
    const onTokensRefreshed = vi.fn();

    const result = await withAuthRetry('token-simples-antigo', 'refresh-simples-antigo', request, onTokensRefreshed);

    expect(result).toBe('resultado-final');
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenNthCalledWith(1, 'token-simples-antigo');
    expect(request).toHaveBeenNthCalledWith(2, 'token-renovado-1');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/refresh'),
      expect.objectContaining({ body: JSON.stringify({ refreshToken: 'refresh-simples-antigo' }) }),
    );
    expect(onTokensRefreshed).toHaveBeenCalledWith({
      accessToken: 'token-renovado-1',
      refreshToken: 'refresh-renovado-1',
    });
  });

  it('refreshToken também expirado — lança SessionExpiredError e nunca repete o pedido original', async () => {
    const request = vi.fn().mockRejectedValue(new ApiError('Token de acesso inválido ou expirado.', 401));
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Refresh token inválido ou expirado.' }), { status: 401 }),
    );

    await expect(
      withAuthRetry('token-refresh-invalido', 'refresh-invalido', request, vi.fn()),
    ).rejects.toBeInstanceOf(SessionExpiredError);
    expect(request).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('nunca cria um ciclo infinito — uma segunda falha 401 depois da renovação nunca dispara uma segunda renovação', async () => {
    // O pedido repetido com o token novo continua a falhar com 401 (ex.
    // o token novo também já não é válido por alguma razão) — não deve
    // tentar renovar outra vez nem repetir de novo; propaga o 401 tal e
    // qual, prova de que nunca há um ciclo.
    const request = vi.fn().mockRejectedValue(new ApiError('Token de acesso inválido ou expirado.', 401));
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accessToken: 'token-renovado-2', refreshToken: 'refresh-renovado-2' }), {
        status: 200,
      }),
    );

    await expect(
      withAuthRetry('token-sem-loop', 'refresh-sem-loop', request, vi.fn()),
    ).rejects.toBeInstanceOf(ApiError);
    expect(request).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('regressão — vários pedidos 401 concorrentes partilham uma única renovação (nunca chamadas paralelas a /auth/refresh)', async () => {
    // Achado real: o backend roda (revoga) o `refreshToken` a cada
    // utilização (`AuthService.refresh()`) — sem partilhar a renovação
    // em curso, um segundo pedido concorrente usando o mesmo
    // `refreshToken` já consumido pelo primeiro receberia 401 do próprio
    // `/auth/refresh`, terminando a sessão por engano mesmo com uma
    // renovação válida a decorrer.
    let resolveFetch: (value: Response) => void = () => undefined;
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const requestA = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('Token de acesso inválido ou expirado.', 401))
      .mockResolvedValueOnce('resultado-A');
    const requestB = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('Token de acesso inválido ou expirado.', 401))
      .mockResolvedValueOnce('resultado-B');
    const onTokensRefreshedA = vi.fn();
    const onTokensRefreshedB = vi.fn();

    const promiseA = withAuthRetry('token-concorrente', 'refresh-concorrente', requestA, onTokensRefreshedA);
    const promiseB = withAuthRetry('token-concorrente', 'refresh-concorrente', requestB, onTokensRefreshedB);

    // Dá tempo às duas chamadas de chegarem ao 401 e pedirem renovação
    // antes de a única chamada a `fetch` (/auth/refresh) ser resolvida.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(global.fetch).toHaveBeenCalledTimes(1);

    resolveFetch(
      new Response(JSON.stringify({ accessToken: 'token-renovado-3', refreshToken: 'refresh-renovado-3' }), {
        status: 200,
      }),
    );

    const [resultA, resultB] = await Promise.all([promiseA, promiseB]);

    expect(resultA).toBe('resultado-A');
    expect(resultB).toBe('resultado-B');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(requestA).toHaveBeenNthCalledWith(2, 'token-renovado-3');
    expect(requestB).toHaveBeenNthCalledWith(2, 'token-renovado-3');
    expect(onTokensRefreshedA).toHaveBeenCalledWith({
      accessToken: 'token-renovado-3',
      refreshToken: 'refresh-renovado-3',
    });
    expect(onTokensRefreshedB).toHaveBeenCalledWith({
      accessToken: 'token-renovado-3',
      refreshToken: 'refresh-renovado-3',
    });
  });

  it('uma sessão seguinte (tokens diferentes, já rodados) nunca reutiliza a renovação de uma sessão anterior — arranca sempre uma renovação nova', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ accessToken: 'token-sessao-b', refreshToken: 'refresh-sessao-b' }), {
        status: 200,
      }),
    );
    global.fetch = fetchMock;

    const requestFirst = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('Token de acesso inválido ou expirado.', 401))
      .mockResolvedValueOnce('primeiro');
    await withAuthRetry('token-sessao-a', 'refresh-sessao-a', requestFirst, vi.fn());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ accessToken: 'token-sessao-c', refreshToken: 'refresh-sessao-c' }), {
        status: 200,
      }),
    );
    const requestSecond = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('Token de acesso inválido ou expirado.', 401))
      .mockResolvedValueOnce('segundo');
    // Usa os tokens já renovados pela PRIMEIRA chamada (`refresh-sessao-b`)
    // — uma chave nova, nunca vista antes, nunca a mesma da primeira
    // chamada (`refresh-sessao-a`, já consumida).
    const result = await withAuthRetry('token-sessao-b', 'refresh-sessao-b', requestSecond, vi.fn());

    expect(result).toBe('segundo');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestSecond).toHaveBeenNthCalledWith(2, 'token-sessao-c');
  });

  it('regressão — correção final pós-revisão Codex: 401 ATRASADO, recebido só depois de a renovação anterior (mesmo refresh token) já ter terminado, reutiliza o resultado em vez de tentar renovar outra vez', async () => {
    // Cenário exato da revisão: A e B usam as mesmas credenciais
    // expiradas; A recebe 401 primeiro e renova (o backend roda —
    // revoga — `refresh-atrasado` nesse momento); a renovação de A
    // TERMINA por completo antes de B sequer receber o seu próprio 401
    // (nunca concorrente — sequencial, ao contrário do teste de 401
    // concorrentes acima). B, atrasado, ainda usa as MESMAS credenciais
    // antigas que A já tinha usado — nunca deve tentar renovar com
    // `refresh-atrasado` outra vez (já rodado/revogado por A), deve
    // antes reutilizar o resultado que A já obteve.
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ accessToken: 'token-renovado-4', refreshToken: 'refresh-renovado-4' }), {
        status: 200,
      }),
    );

    const requestA = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('Token de acesso inválido ou expirado.', 401))
      .mockResolvedValueOnce('resultado-A');
    const onTokensRefreshedA = vi.fn();
    const resultA = await withAuthRetry('token-atrasado', 'refresh-atrasado', requestA, onTokensRefreshedA);

    expect(resultA).toBe('resultado-A');
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Só DEPOIS de a renovação de A já ter terminado por completo, B
    // recebe o seu 401 — ainda associado às MESMAS credenciais antigas.
    const requestB = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('Token de acesso inválido ou expirado.', 401))
      .mockResolvedValueOnce('resultado-B');
    const onTokensRefreshedB = vi.fn();
    const resultB = await withAuthRetry('token-atrasado', 'refresh-atrasado', requestB, onTokensRefreshedB);

    expect(resultB).toBe('resultado-B');
    expect(requestB).toHaveBeenNthCalledWith(2, 'token-renovado-4');
    expect(onTokensRefreshedB).toHaveBeenCalledWith({
      accessToken: 'token-renovado-4',
      refreshToken: 'refresh-renovado-4',
    });
    // `/auth/refresh` continua a ter sido chamado apenas UMA vez no total
    // — B nunca tentou renovar outra vez com o `refresh-atrasado` já
    // rodado, nunca terminou a sessão por engano.
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

/**
 * `recordExternalRefresh()`/`clearRefreshCache()` — correção final
 * pós-revisão Codex (Secção 3, coordenação multi-tab e ciclo de vida da
 * cache). `SessionProvider` chama `recordExternalRefresh()` ao reagir a
 * um evento `storage` de outra tab (ver `lib/session-context.tsx`) —
 * aqui testado diretamente, sem depender de React, exatamente a mesma
 * disciplina de `withAuthRetry` acima (só o `fetch` global é mockado).
 */
describe('recordExternalRefresh / clearRefreshCache', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearRefreshCache();
  });

  it('um resultado externo já registado é usado sem qualquer chamada de rede', async () => {
    global.fetch = vi.fn();
    recordExternalRefresh('refresh-externo-1', { accessToken: 'token-externo-1', refreshToken: 'refresh-novo-externo-1' });

    const request = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('Token de acesso inválido ou expirado.', 401))
      .mockResolvedValueOnce('ok');
    const onTokensRefreshed = vi.fn();

    const result = await withAuthRetry('token-antigo-externo-1', 'refresh-externo-1', request, onTokensRefreshed);

    expect(result).toBe('ok');
    expect(request).toHaveBeenNthCalledWith(2, 'token-externo-1');
    expect(onTokensRefreshed).toHaveBeenCalledWith({ accessToken: 'token-externo-1', refreshToken: 'refresh-novo-externo-1' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('recuperação de corrida: a chamada de rede PRÓPRIA falha, mas um resultado externo registado entretanto evita SessionExpiredError', async () => {
    let rejectFetch: (reason: unknown) => void = () => undefined;
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectFetch = reject;
        }),
    );

    const request = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('Token de acesso inválido ou expirado.', 401))
      .mockResolvedValueOnce('recuperado');
    const onTokensRefreshed = vi.fn();

    const resultPromise = withAuthRetry('token-antigo-externo-2', 'refresh-externo-2', request, onTokensRefreshed);

    // Enquanto a chamada de rede PRÓPRIA está pendente, chega o
    // resultado de outra tab para o MESMO `refreshToken`.
    await Promise.resolve();
    await Promise.resolve();
    recordExternalRefresh('refresh-externo-2', { accessToken: 'token-recuperado', refreshToken: 'refresh-recuperado' });

    // Só agora a chamada de rede PRÓPRIA falha (ex. o `refreshToken` já
    // tinha sido rodado por essa outra tab).
    rejectFetch(new ApiError('Refresh token inválido.', 401));

    const result = await resultPromise;
    expect(result).toBe('recuperado');
    expect(request).toHaveBeenNthCalledWith(2, 'token-recuperado');
    expect(onTokensRefreshed).toHaveBeenCalledWith({ accessToken: 'token-recuperado', refreshToken: 'refresh-recuperado' });
  });

  it('recordExternalRefresh nunca substitui um resultado já registado para o mesmo refreshToken', async () => {
    global.fetch = vi.fn();
    recordExternalRefresh('refresh-dup', { accessToken: 'token-primeiro', refreshToken: 'refresh-primeiro' });
    // Um "vencedor" tardio anunciando o mesmo `refreshToken` (nunca deveria
    // acontecer no backend — utilização única — mas a API é defensiva) nunca sobrepõe o já registado.
    recordExternalRefresh('refresh-dup', { accessToken: 'token-segundo', refreshToken: 'refresh-segundo' });

    const request = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('Token de acesso inválido ou expirado.', 401))
      .mockResolvedValueOnce('ok');
    const result = await withAuthRetry('token-antigo-dup', 'refresh-dup', request, vi.fn());

    expect(result).toBe('ok');
    // Sempre o PRIMEIRO valor registado — nunca o segundo.
    expect(request).toHaveBeenNthCalledWith(2, 'token-primeiro');
  });

  it('clearRefreshCache() limpa a cache local e externa — uma renovação seguinte arranca sempre uma chamada de rede nova', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accessToken: 'token-pos-clear', refreshToken: 'refresh-pos-clear' }), { status: 200 }),
    );
    recordExternalRefresh('refresh-clear', { accessToken: 'token-nunca-usado', refreshToken: 'refresh-nunca-usado' });

    clearRefreshCache();

    const request = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('Token de acesso inválido ou expirado.', 401))
      .mockResolvedValueOnce('ok-depois-de-limpar');

    const result = await withAuthRetry('token-antigo-clear', 'refresh-clear', request, vi.fn());

    expect(result).toBe('ok-depois-de-limpar');
    // Nunca reutilizou o resultado externo registado ANTES da limpeza — chamou `/auth/refresh` de verdade.
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenNthCalledWith(2, 'token-pos-clear');
  });
});

/**
 * Correção pós-revisão Codex, Secção 1 — coordenação determinística da
 * corrida multi-tab. `createIsolatedRefreshCoordinator()` (`lib/auth.ts`)
 * dá a cada "tab" simulada aqui o seu PRÓPRIO conjunto de `Map`s de
 * cache/waiters, nunca o partilhado pelo módulo — a única coisa que as
 * duas instâncias partilham é exatamente o que duas tabs reais
 * partilhariam: o `fetch` global (o mesmo backend) e uma chamada
 * explícita a `recordExternalRefresh()` da OUTRA instância, a simular a
 * entrega do evento `storage` que `SessionProvider` faria na prática.
 * Isto prova que a recuperação de B depende do MECANISMO novo (waiters +
 * timeout), nunca de as duas "tabs" acidentalmente partilharem o mesmo
 * `Map` de módulo — com realms isolados, a cache local de B nunca vê o
 * resultado de A; só o evento explícito o pode entregar.
 */
describe('coordenação cross-tab determinística com realms isolados (Secção 1)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('sequência exata: A e B iniciam refresh com R1; A vence; B recebe 401 e NÃO termina a sessão; evento de A chega depois; B retoma com A2 e repete o pedido original uma única vez; nenhuma sessão é limpa', async () => {
    const coordinatorA = createIsolatedRefreshCoordinator();
    const coordinatorB = createIsolatedRefreshCoordinator();

    let resolveA: (value: Response) => void = () => undefined;
    let resolveB: (value: Response) => void = () => undefined;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveA = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveB = resolve;
          }),
      );
    global.fetch = fetchMock;

    const requestA = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('Token de acesso inválido ou expirado.', 401))
      .mockResolvedValueOnce('resultado-A');
    const requestB = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('Token de acesso inválido ou expirado.', 401))
      .mockResolvedValueOnce('resultado-B');

    // 1. A e B iniciam refresh com R1 — cada uma na sua própria instância
    // de coordenação (realm independente), nunca partilhando cache.
    const promiseA = withAuthRetry('token-R1', 'R1', requestA, vi.fn(), coordinatorA);
    const promiseB = withAuthRetry('token-R1', 'R1', requestB, vi.fn(), coordinatorB);

    await new Promise((resolve) => setTimeout(resolve, 0));
    // Ambas as tabs fizeram a SUA PRÓPRIA chamada de rede a /auth/refresh
    // — prova de que não há nenhum Map partilhado a deduplicar por baixo.
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 2. A vence.
    resolveA(
      new Response(JSON.stringify({ accessToken: 'token-A2', refreshToken: 'R2' }), { status: 200 }),
    );
    const resultA = await promiseA;
    expect(resultA).toBe('resultado-A');

    // 3. B recebe 401 — a SUA PRÓPRIA chamada a /auth/refresh falha,
    // porque R1 já foi rodado/revogado pelo backend a favor de A.
    resolveB(new Response(JSON.stringify({ message: 'Refresh token inválido.' }), { status: 401 }));

    // 4. B ainda NÃO termina a sessão — a promessa de B continua
    // pendente (à espera de um resultado externo), nunca rejeita de
    // imediato com SessionExpiredError.
    let bSettled = false;
    promiseB.then(
      () => {
        bSettled = true;
      },
      () => {
        bSettled = true;
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(bSettled).toBe(false);

    // 5. Depois chega o evento de A com A2/R2 — simulado exatamente como
    // `SessionProvider` faria ao reagir ao evento `storage`: uma chamada
    // explícita a `recordExternalRefresh()` na instância de B.
    coordinatorB.recordExternalRefresh('R1', { accessToken: 'token-A2', refreshToken: 'R2' });

    // 6. B retoma com A2. 7. O pedido original de B é repetido uma única
    // vez.
    const resultB = await promiseB;
    expect(resultB).toBe('resultado-B');
    expect(requestB).toHaveBeenCalledTimes(2);
    expect(requestB).toHaveBeenNthCalledWith(2, 'token-A2');

    // 8. Nenhuma sessão é limpa — nunca uma terceira chamada de rede
    // (B nunca tentou renovar outra vez), e nenhuma das duas promessas
    // rejeitou com SessionExpiredError (já teria falhado o `await` acima).
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sem qualquer resultado externo dentro da janela de espera, a sessão expira de facto — nunca espera indefinidamente, nunca repete o pedido', async () => {
    vi.useFakeTimers();
    const coordinator = createIsolatedRefreshCoordinator();
    let resolveFetch: (value: Response) => void = () => undefined;
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const request = vi.fn().mockRejectedValue(new ApiError('Token de acesso inválido ou expirado.', 401));

    const resultPromise = withAuthRetry('token-timeout', 'refresh-timeout', request, vi.fn(), coordinator);
    // Regista o handler de rejeição já aqui (antes de avançar os
    // temporizadores) — nunca deixar `resultPromise` transitoriamente
    // sem handler entre o momento em que rejeita (dentro de
    // `advanceTimersByTimeAsync`, abaixo) e a asserção.
    const assertion = expect(resultPromise).rejects.toBeInstanceOf(SessionExpiredError);

    await vi.advanceTimersByTimeAsync(0);
    resolveFetch(new Response(JSON.stringify({ message: 'Refresh token inválido.' }), { status: 401 }));
    await vi.advanceTimersByTimeAsync(0);

    // Ainda dentro da janela de espera — nenhum resultado externo chegou.
    await vi.advanceTimersByTimeAsync(EXTERNAL_REFRESH_WAIT_MS + 50);

    await assertion;
    expect(request).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
