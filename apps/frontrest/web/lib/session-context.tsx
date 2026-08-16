'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@frontcore/ui';
import {
  SESSION_KEY,
  getSession,
  saveSession,
  clearSession,
  logout as logoutRequest,
  fetchMe,
  withAuthRetry,
  SessionExpiredError,
  StaleSessionError,
  recordExternalRefresh,
  clearRefreshCache,
} from './auth';
import type { Session, RefreshedTokens, AuthFetch } from './auth';

interface Me {
  user: { id: string; email: string; name: string | null };
  organization: { id: string; name: string; slug: string };
  role: string;
}

interface SessionContextValue {
  session: Session;
  me: Me;
  /**
   * Termina a sessão a pedido do utilizador — correção pós-revisão Codex
   * (Finding 3): invalida tudo localmente (geração, estado React,
   * caches/waiters) ANTES de sequer tentar `POST /auth/logout`, nunca
   * depois. Nenhum `authFetch` novo, nenhuma renovação já pendente, nem
   * o pedido original que a despoletou podem continuar a agir em nome
   * desta sessão a partir do momento em que `logout()` é chamado — a
   * chamada de rede ao backend é sempre best-effort a seguir, nunca uma
   * condição para o estado local já ser considerado terminado.
   */
  logout: () => Promise<void>;
  /**
   * Persiste um par de tokens renovado (`POST /auth/refresh`) na sessão
   * atual — usado por `authFetch()` (abaixo) depois de uma renovação
   * silenciosa bem-sucedida, para qualquer pedido seguinte já usar o
   * `accessToken` novo. Nunca substitui `user`/`organization`/`role` —
   * só os tokens mudam numa renovação. Atualiza sempre a `ref` interna
   * de forma síncrona (nunca só o estado React) — ver `sessionRef`,
   * abaixo. Persiste em `localStorage`, o que propaga automaticamente
   * para outras tabs via o evento `storage` (nunca precisa de um canal
   * à parte).
   */
  updateTokens: (tokens: RefreshedTokens) => void;
  /**
   * Termina a sessão de imediato, sem tentar `POST /auth/logout` — usado
   * quando `authFetch()` (abaixo) apanha `SessionExpiredError` (o
   * `refreshToken` já é sabido inválido; um pedido de logout ao backend
   * com esse token estaria condenado a falhar, e é desnecessário —
   * `logout()` no backend só revoga o próprio token). Limpa sempre o
   * estado React (e a `ref` interna) ANTES de limpar `localStorage` e
   * só depois reencaminha para `/login` — nenhum descendente pode voltar
   * a observar `session`/`me` já expirados no intervalo até à navegação.
   * Propaga-se automaticamente a outras tabs — `clearSession()` remove
   * `SESSION_KEY` de `localStorage`, o que dispara o evento `storage`
   * nas outras tabs, cada uma terminando a sua própria sessão local.
   */
  sessionExpired: () => void;
  /**
   * Chamada autenticada centralizada — única forma recomendada de
   * invocar a API a partir de qualquer componente dentro de
   * `SessionProvider`. Lê sempre os tokens mais recentes (nunca uma
   * closure presa a um valor de `session` capturado no início de um
   * handler), tenta renovar a sessão uma única vez num 401, atualiza a
   * sessão persistida, e — se a renovação também falhar — termina a
   * sessão de forma uniforme (`sessionExpired()`) antes de propagar
   * `SessionExpiredError`.
   *
   * Correção final pós-revisão Codex (isolamento temporal): captura
   * sempre a "geração" da sessão corrente no início do pedido — se essa
   * geração deixar de ser a corrente antes de a renovação terminar
   * (logout, `sessionExpired()`, ou troca de sessão, entretanto), o
   * pedido é abortado com `StaleSessionError` em vez de aplicar tokens
   * renovados ou repetir o pedido original com credenciais de uma
   * sessão já terminada.
   */
  authFetch: AuthFetch;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Guard de rota protegida centralizado — substitui a verificação de sessão
 * que antes era duplicada em cada página (`login`/`dashboard`). Específico
 * do FrontRest (conhece `Session`/`Membership`); fica em `apps/frontrest`,
 * não em `packages/ui`.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<{ session: Session; me: Me } | null>(null);

  /**
   * Espelho síncrono de `state?.session`, sempre atualizado no MESMO
   * instante em que a sessão muda (nunca só depois do próximo render,
   * como aconteceria dependendo de um `useEffect([state])`) —
   * `authFetch()` lê sempre esta `ref`, nunca `state.session`
   * diretamente, precisamente para um handler que encadeia vários
   * pedidos autenticados (ex. `sendChatMessage()` seguido de
   * `getConversation()`) ver sempre os tokens mais recentes, mesmo que
   * o primeiro pedido tenha renovado a sessão a meio do próprio handler
   * — closures que capturassem `session` no início do handler ficariam
   * presas ao valor antigo até ao próximo render (achado real, AI
   * Chat).
   */
  const sessionRef = useRef<Session | null>(null);

  /**
   * Identidade explícita da sessão ativa NESTA tab — correção final
   * pós-revisão Codex (isolamento temporal). Incrementada sempre que a
   * sessão local TERMINA (logout, `sessionExpired()`, ou reação a outra
   * tab ter terminado a sessão partilhada) — nunca numa simples
   * renovação de tokens (essa continua a ser a MESMA sessão lógica).
   * `authFetch()` captura este valor no início de cada pedido; antes de
   * aplicar tokens renovados ou repetir o pedido original, confirma que
   * a geração ainda é a mesma. Não basta verificar `sessionRef !==
   * null` — depois de um logout seguido de um novo login (mesma tab,
   * `SessionProvider` no mesmo mount), `sessionRef` volta a ficar
   * não-nulo, mas pertence a uma sessão diferente; só a geração
   * distingue as duas.
   */
  const generationRef = useRef(0);

  /**
   * Distingue "esta tab já terminou a sua sessão" de "esta tab nunca
   * chegou a ter uma sessão ativa" — `sessionRef.current` sozinho não
   * chega: também é `null` ANTES do bootstrap terminar (ex. falha
   * direta, sem sessão válida nenhuma), um estado bem diferente de
   * "tinha sessão, foi terminada". `invalidateLocalSessionOnly()` (o
   * núcleo partilhado por todas as formas de terminar a sessão local,
   * abaixo) só é idempotente em relação a ESTE sinal — nunca ao
   * `sessionRef`.
   */
  const terminatedRef = useRef(false);

  /**
   * Identidade de montagem desta instância de `SessionProvider` —
   * correção pós-revisão Codex (lifecycle completo, Secções 2/4/5). Ao
   * contrário de `generationRef` (bump só em terminação lógica da
   * sessão), este sinal cobre o desmonte físico do componente — um
   * `authFetch()` ou bootstrap pendente cujo `SessionProvider` já não
   * está na árvore nunca deve aplicar tokens, escrever `localStorage`
   * nem chamar `setState`, mesmo que a geração capturada continue,
   * tecnicamente, a ser a "corrente".
   *
   * `epoch` — correção pós-revisão Codex (Finding 2, React StrictMode):
   * um `mounted` boolean sozinho, sem identidade de execução, fica
   * permanentemente `false` depois do ciclo setup→cleanup→setup que o
   * StrictMode de desenvolvimento corre em cada efeito — o cleanup do
   * PRIMEIRO setup nunca era reposto pelo SEGUNDO, prendendo o bootstrap
   * (e qualquer `authFetch` seguinte) num "desmontado" permanente, com o
   * `SessionProvider` visivelmente montado e preso no spinner. Cada
   * execução do efeito de bootstrap incrementa `epoch` e marca-se a si
   * própria como montada, SEM depender do valor deixado por uma
   * execução anterior; o cleanup dessa execução só desmonta se `epoch`
   * ainda for exatamente o que essa execução capturou — nunca desfaz um
   * setup mais recente que já a substituiu.
   */
  const instanceRef = useRef({ mounted: true, epoch: 0 });

  /**
   * Único ponto que decide se uma operação assíncrona ainda pode
   * produzir efeitos secundários (`saveSession`, `setState`,
   * `sessionRef`, repetição do pedido original, adoção de renovação
   * externa, terminação/limpeza) — correção pós-revisão Codex, Secção 5
   * ("não espalhar checks inconsistentes por vários callbacks"). Uma
   * operação só continua válida se esta instância ainda estiver montada
   * E a geração capturada no início da operação continuar a ser a
   * corrente — qualquer uma das duas condições invalida sozinha
   * (desmonte físico do componente; ou terminação/troca de sessão lógica
   * sem desmonte, ex. `sessionExpired()` chamado enquanto ainda há uma
   * árvore React a observar).
   *
   * `operationEpoch` (opcional) — correção pós-revisão Codex (StrictMode,
   * isolamento entre epochs do bootstrap): `mounted`/`generation` sozinhos
   * não distinguem DUAS execuções do efeito de bootstrap que se
   * sobrepõem (setup A → cleanup A → setup B, sem que A alguma vez
   * termine o seu trabalho assíncrono antes de B arrancar) — o cleanup
   * de A só desmonta enquanto B não incrementou `epoch`; assim que B
   * arranca, `mounted` volta a `true` e `generation` continua a mesma,
   * fazendo com que um callback TARDIO de A voltasse a parecer "corrente"
   * mesmo depois de B já ter instalado a SUA sessão. Quando o chamador
   * passa `operationEpoch` (sempre o bootstrap, que tem uma execução de
   * efeito distinta por `myEpoch`), esta função exige adicionalmente que
   * `instanceRef.current.epoch` continue a ser exatamente esse valor —
   * nunca o de uma execução mais recente que já a substituiu. Omitido
   * por quem não tem essa noção de execução (`authFetch`, uma chamada de
   * função, não um efeito) — nesse caso só `mounted`/`generation`
   * decidem, como antes.
   */
  function isOperationStillCurrent(operationGeneration: number, operationEpoch?: number): boolean {
    if (!instanceRef.current.mounted) return false;
    if (generationRef.current !== operationGeneration) return false;
    if (operationEpoch !== undefined && instanceRef.current.epoch !== operationEpoch) return false;
    return true;
  }

  /**
   * Núcleo comum a QUALQUER forma de terminar a sessão desta tab —
   * incrementa a geração, limpa `sessionRef`/estado React e a cache de
   * renovações/waiters. Nunca toca em `localStorage` nem navega —
   * correção pós-revisão Codex (Finding 1): essas duas ações têm
   * consequências opostas consoante a origem da terminação (ver
   * `terminateAndClearSharedSession()` vs.
   * `invalidateLocalSessionForExternalIdentitySwitch()`, abaixo), nunca
   * podem viver no mesmo helper que decide por todos os casos.
   *
   * Idempotente (`terminatedRef`) — devolve `false` numa segunda chamada
   * (ex. `sessionExpired()` chamado duas vezes, ou um evento `storage`
   * redundante), para os helpers que a envolvem saberem que não há nada
   * mais a fazer (nunca limpar `localStorage`/navegar outra vez sem
   * necessidade).
   */
  function invalidateLocalSessionOnly(): boolean {
    if (terminatedRef.current) return false;
    terminatedRef.current = true;
    sessionRef.current = null;
    generationRef.current += 1;
    clearRefreshCache();
    setState(null);
    return true;
  }

  /**
   * Terminação cuja origem é a PRÓPRIA sessão partilhada ter acabado —
   * logout local, `sessionExpired()` local, falha de bootstrap (nunca
   * chegou a ter sessão válida), ou reação a um evento `storage` que
   * indica que OUTRA tab já removeu `SESSION_KEY` (`newValue === null`,
   * logout dessa tab). Em todos estes casos é seguro (e necessário)
   * remover `SESSION_KEY` — ou fomos nós a decidir terminar, ou a outra
   * tab já o tinha feito (`clearSession()` aqui é então um no-op
   * redundante, nunca destrutivo). NUNCA usar para reagir a uma troca de
   * identidade S1→S2 — nesse caso `SESSION_KEY` já contém a sessão NOVA
   * e legítima escrita por outra tab (ver
   * `invalidateLocalSessionForExternalIdentitySwitch()`, abaixo).
   */
  function terminateAndClearSharedSession() {
    if (!invalidateLocalSessionOnly()) return;
    clearSession();
    router.push('/login');
  }

  /**
   * Reação a uma substituição de identidade externa — evento `storage`
   * com `user.id`/`organization.id` diferentes do valor anterior (S1→S2,
   * Finding 1). Invalida SÓ o estado desta tab (a sessão antiga, S1):
   * NUNCA chama `clearSession()` — `localStorage` já contém S2, escrito
   * legitimamente por outra tab; removê-lo apagaria a sessão nova e
   * podia desautenticar globalmente a tab que a criou. NUNCA emite outro
   * evento `storage` (não escreve nada) — só redireciona esta tab para
   * `/login`, o fluxo seguro já usado para qualquer sessão local
   * terminada.
   */
  function invalidateLocalSessionForExternalIdentitySwitch() {
    if (!invalidateLocalSessionOnly()) return;
    router.push('/login');
  }

  /**
   * Aplica tokens renovados NOUTRA tab — nunca escreve em `localStorage`
   * (já lá estão, foi a tab de origem que escreveu) nem altera a
   * geração (continua a ser a mesma sessão lógica, só os tokens
   * rodaram). Só atualiza `sessionRef`/estado quando a sessão local
   * ainda é a mesma que foi renovada (comparação feita pelo chamador,
   * `handleStorage`, abaixo) — nunca adota tokens de uma sessão
   * diferente.
   */
  function applyExternalTokens(tokens: RefreshedTokens) {
    const current = sessionRef.current;
    if (!current) return;
    const nextSession: Session = { ...current, ...tokens };
    sessionRef.current = nextSession;
    setState((prev) => (prev ? { ...prev, session: nextSession } : prev));
  }

  /**
   * Bootstrap — correção pós-revisão Codex, Secção 2 ("bootstrap não
   * pode ressuscitar sessão terminada"). Captura a geração corrente
   * ANTES de qualquer `await` — se um logout/`sessionExpired()`/evento
   * `storage` de outra tab terminar a sessão local enquanto `fetchMe()`
   * (ou a sua renovação) ainda está pendente, `generationRef` já
   * incrementou quando a resposta chega, e `isOperationStillCurrent()`
   * passa a devolver `false` para esta operação — nunca grava tokens,
   * nunca restaura estado, nunca desfaz o redirecionamento já em curso.
   * A mesma função cobre também o desmonte físico do componente
   * (`instanceRef.current.mounted`, invalidado no cleanup abaixo) —
   * resposta tardia depois de a árvore já ter sido desmontada (ex.
   * navegação para fora de `(dashboard)`) nunca chama `setState` nem
   * `saveSession`. Passa também `myEpoch` (capturado abaixo) a todas as
   * chamadas de `isOperationStillCurrent()` — correção pós-revisão Codex
   * (StrictMode, isolamento entre epochs): sem o epoch, um callback
   * tardio de um setup ANTERIOR (setup A → cleanup A → setup B, sem A
   * alguma vez terminar antes de B arrancar) via a `mounted`/`generation`
   * já repostos por B e voltava a agir como se fosse corrente — podendo
   * sobrescrever o estado que B já instalou com sucesso, ou terminar a
   * sessão válida de B se A falhasse depois.
   */
  useEffect(() => {
    // Correção pós-revisão Codex (Finding 2, StrictMode) — cada execução
    // do efeito marca-se A SI PRÓPRIA como montada e reclama uma nova
    // identidade (`myEpoch`), nunca dependendo de o cleanup de uma
    // execução anterior ter deixado `mounted` no valor "certo". Copiado
    // para uma variável local — `instanceRef.current` é sempre o MESMO
    // objeto (nunca reatribuído, só mutado), mas capturar a referência
    // aqui evita o aviso do linter sobre ler `ref.current` dentro do
    // cleanup e mantém a instância a invalidar sempre explícita.
    const instance = instanceRef.current;
    const myEpoch = ++instance.epoch;
    instance.mounted = true;

    const bootstrapGeneration = generationRef.current;

    const initialSession = getSession();
    if (!initialSession) {
      router.push('/login');
      return () => {
        if (instance.epoch === myEpoch) instance.mounted = false;
      };
    }

    // Sessão de bootstrap "de trabalho" — só usada dentro deste efeito,
    // para acompanhar uma eventual renovação sem depender do estado
    // React (ainda `null` neste ponto). `withAuthRetry()` chama
    // `onTokensRefreshed` de forma síncrona antes de repetir
    // `fetchMe()`, por isso este valor está sempre atualizado quando
    // `.then()` lê `latestSession.current`.
    const latestSession = { current: initialSession };

    withAuthRetry(
      initialSession.accessToken,
      initialSession.refreshToken,
      (accessToken) => fetchMe(accessToken),
      (tokens) => {
        if (!isOperationStillCurrent(bootstrapGeneration, myEpoch)) {
          // Já terminado/desmontado/substituído por um setup mais recente
          // antes de a renovação terminar — nunca grava o token novo por
          // cima de uma sessão que já não é esta; aborta sem repetir
          // `fetchMe()`.
          throw new StaleSessionError();
        }
        latestSession.current = { ...latestSession.current, ...tokens };
        saveSession(latestSession.current);
      },
    )
      .then((me) => {
        if (!isOperationStillCurrent(bootstrapGeneration, myEpoch)) return;
        sessionRef.current = latestSession.current;
        setState({ session: latestSession.current, me });
      })
      .catch((err) => {
        if (err instanceof StaleSessionError) {
          // Abort próprio, lançado acima — a instância já reagiu à
          // terminação pela via original; nunca terminar outra vez aqui.
          return;
        }
        if (!isOperationStillCurrent(bootstrapGeneration, myEpoch)) return;
        // Access token expirado sem refresh token válido (ou qualquer
        // outra falha de `fetchMe`, comportamento inalterado desde
        // sempre) — nunca deixar uma sessão morta em `localStorage`. A
        // verificação de epoch acima garante que só o setup MAIS RECENTE
        // pode chegar aqui — uma falha tardia de um setup já substituído
        // (StrictMode) nunca termina/limpa a sessão válida instalada
        // pelo setup atual.
        terminateAndClearSharedSession();
      });

    return () => {
      // Só desmonta se `epoch` ainda for exatamente o que esta execução
      // capturou — nunca desfaz um setup mais recente (StrictMode
      // setup→cleanup→setup) que já reclamou uma identidade nova.
      if (instance.epoch === myEpoch) instance.mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  /**
   * Coordenação multi-tab — correção pós-revisão Codex, Secções 1/3/6.
   * `localStorage`/evento `storage` (nunca `BroadcastChannel`: a
   * implementação nativa do Node, exposta globalmente, colide com as
   * classes `Event`/`MessageEvent` do jsdom no ambiente de teste — ver
   * `lib/auth.ts`). O evento `storage` dispara sempre nas OUTRAS tabs
   * (nunca na que fez a escrita, por especificação), com `oldValue`/
   * `newValue` já prontos — nunca precisa de um protocolo à parte:
   *
   * - `newValue === null` → outra tab já removeu `SESSION_KEY` (logout
   *   dessa tab) — terminar também aqui, via
   *   `terminateAndClearSharedSession()` (a chave já não existe;
   *   `clearSession()` aqui é um no-op inofensivo).
   * - `newValue` com identidade (`user.id`/`organization.id`) diferente
   *   da anterior → NUNCA é uma simples renovação, é uma troca de sessão
   *   (S1→S2, ex. logout seguido de novo login noutra tab, ou troca de
   *   organização) — Finding 1 (correção pós-revisão Codex). Aplicar só
   *   os tokens novos por cima dos metadados antigos produziria uma
   *   sessão híbrida (tokens de S2 com `user`/`organization` de S1); em
   *   vez disso, esta tab invalida SÓ o seu próprio estado local via
   *   `invalidateLocalSessionForExternalIdentitySwitch()` — NUNCA
   *   `terminateAndClearSharedSession()`/`clearSession()` aqui:
   *   `SESSION_KEY` já contém S2, escrito legitimamente por outra tab;
   *   removê-lo apagaria a sessão nova e desautenticaria globalmente a
   *   tab que a criou (bug real, corrigido nesta secção). Nunca adota S2
   *   "ao vivo" por fora do fluxo de bootstrap normal — uma
   *   navegação/login subsequente lê sempre S2 corretamente do zero.
   * - `newValue` com a MESMA identidade mas `refreshToken` diferente →
   *   renovação genuína da mesma sessão; regista sempre o resultado
   *   (para qualquer pedido local em curso reaproveitar, mesmo que esta
   *   tab não tenha sessão ativa agora — Secção 1) e, SE a sessão local
   *   corrente for exatamente a que foi substituída, adota os tokens
   *   novos.
   */
  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key !== SESSION_KEY) return;

      if (event.newValue === null) {
        terminateAndClearSharedSession();
        return;
      }

      let nextSession: Session;
      try {
        nextSession = JSON.parse(event.newValue) as Session;
      } catch {
        return;
      }

      let previousSession: Session | null = null;
      if (event.oldValue) {
        try {
          previousSession = JSON.parse(event.oldValue) as Session;
        } catch {
          previousSession = null;
        }
      }

      if (!previousSession) {
        // Sem sessão anterior para comparar (ex. primeira escrita nesta
        // origem) — nada a coordenar; esta tab nunca se revive sozinha a
        // partir de um valor que nunca chegou a bootstrapar.
        return;
      }

      const isIdentitySwitch =
        previousSession.user.id !== nextSession.user.id ||
        previousSession.organization.id !== nextSession.organization.id;

      if (isIdentitySwitch) {
        invalidateLocalSessionForExternalIdentitySwitch();
        return;
      }

      if (previousSession.refreshToken === nextSession.refreshToken) {
        // Mesma identidade, mesmos tokens — esta própria tab acabou de
        // escrever, ou um evento redundante; nada a coordenar.
        return;
      }

      recordExternalRefresh(previousSession.refreshToken, {
        accessToken: nextSession.accessToken,
        refreshToken: nextSession.refreshToken,
      });

      const current = sessionRef.current;
      if (current && current.refreshToken === previousSession.refreshToken) {
        applyExternalTokens({ accessToken: nextSession.accessToken, refreshToken: nextSession.refreshToken });
      }
    }

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Logout iniciado NESTA tab — correção pós-revisão Codex (Finding 3):
   * invalida tudo localmente ANTES de sequer tentar `POST /auth/logout`,
   * nunca depois. Com a ordem antiga (`await logoutRequest(...)` só
   * depois `terminateLocally()`), qualquer coisa pendente durante esse
   * `await` — uma renovação em curso, um `authFetch` que ainda não
   * chegou ao 401 — continuava a ver a geração antiga como válida,
   * podendo aplicar tokens novos, repetir o pedido original, ou mesmo
   * concluir um POST/PATCH/DELETE já depois de o utilizador ter pedido
   * para terminar sessão. Captura os tokens ANTES de invalidar (só
   * `sessionRef`, que a invalidação limpa, tinha essa informação) para o
   * pedido de logout ao backend, sempre best-effort (`logoutRequest()`
   * já nunca rejeita — `lib/auth.ts`): a sua falha nunca reativa a
   * sessão nem impede a limpeza de `localStorage`/navegação, que
   * dependem só do sucesso da invalidação local, nunca da rede.
   */
  async function logout() {
    const tokensForRemoteLogout = sessionRef.current;
    const didInvalidate = invalidateLocalSessionOnly();

    if (tokensForRemoteLogout) {
      await logoutRequest(tokensForRemoteLogout.refreshToken);
    }

    if (didInvalidate) {
      clearSession();
      router.push('/login');
    }
  }

  function updateTokens(tokens: RefreshedTokens) {
    const current = sessionRef.current;
    if (!current) return;
    const nextSession: Session = { ...current, ...tokens };
    sessionRef.current = nextSession;
    saveSession(nextSession);
    setState((prev) => (prev ? { ...prev, session: nextSession } : prev));
  }

  function sessionExpired() {
    // Ordem obrigatória: estado React primeiro — nenhum descendente pode
    // voltar a observar `session`/`me` autenticados depois deste ponto —
    // só depois `localStorage` (`terminateAndClearSharedSession()`, que
    // também propaga a outras tabs via o evento `storage`), só depois a
    // navegação.
    terminateAndClearSharedSession();
  }

  const authFetch: AuthFetch = (request) => {
    const operationGeneration = generationRef.current;
    const current = sessionRef.current;
    if (!current || !isOperationStillCurrent(operationGeneration)) {
      return Promise.reject(new StaleSessionError());
    }
    return withAuthRetry(current.accessToken, current.refreshToken, request, (tokens) => {
      // Correção pós-revisão Codex, Secções 4/5 — antes de aplicar
      // tokens renovados, confirma (via a mesma função central que o
      // bootstrap usa) que este pedido ainda pertence à sessão corrente
      // E que a instância continua montada. Lançar aqui impede
      // `withAuthRetry()` de sequer chegar a repetir `request()` com
      // credenciais de uma sessão já terminada/substituída, ou depois de
      // `SessionProvider` já ter desmontado.
      if (!isOperationStillCurrent(operationGeneration)) {
        throw new StaleSessionError();
      }
      updateTokens(tokens);
    }).catch((err) => {
      if (err instanceof SessionExpiredError && isOperationStillCurrent(operationGeneration)) {
        // Só termina a sessão corrente se este pedido ainda pertencer a
        // ela e a instância continuar montada — um pedido já órfão
        // (geração antiga, ou desmontado) nunca deve voltar a mexer na
        // sessão corrente, mesmo por esta via.
        sessionExpired();
      }
      throw err;
    });
  };

  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <SessionContext.Provider
      value={{ session: state.session, me: state.me, logout, updateTokens, sessionExpired, authFetch }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession must be used within SessionProvider');
  }
  return ctx;
}
