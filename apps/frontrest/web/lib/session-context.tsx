'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@frontcore/ui';
import { getSession, saveSession, clearSession, logout as logoutRequest, fetchMe } from './auth';
import type { Session, RefreshedTokens } from './auth';

interface Me {
  user: { id: string; email: string; name: string | null };
  organization: { id: string; name: string; slug: string };
  role: string;
}

interface SessionContextValue {
  session: Session;
  me: Me;
  logout: () => Promise<void>;
  /**
   * Persiste um par de tokens renovado (`POST /auth/refresh`) na sessão
   * atual — usado por `withAuthRetry()` (`lib/auth.ts`) depois de uma
   * renovação silenciosa bem-sucedida, para qualquer pedido seguinte já
   * usar o `accessToken` novo. Nunca substitui `user`/`organization`/
   * `role` — só os tokens mudam numa renovação.
   */
  updateTokens: (tokens: RefreshedTokens) => void;
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

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.push('/login');
      return;
    }
    fetchMe(session.accessToken)
      .then((me) => setState({ session, me }))
      .catch(() => {
        clearSession();
        router.push('/login');
      });
  }, [router]);

  async function logout() {
    const session = getSession();
    if (session) await logoutRequest(session.refreshToken);
    clearSession();
    router.push('/login');
  }

  function updateTokens(tokens: RefreshedTokens) {
    setState((prev) => {
      if (!prev) return prev;
      const nextSession: Session = { ...prev.session, ...tokens };
      saveSession(nextSession);
      return { ...prev, session: nextSession };
    });
  }

  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <SessionContext.Provider value={{ session: state.session, me: state.me, logout, updateTokens }}>
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
