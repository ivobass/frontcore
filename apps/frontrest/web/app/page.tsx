'use client';

import { useEffect, useState } from 'react';
import { cn } from '@frontcore/ui';
import { API_URL } from '../lib/api';

type State = 'checking' | 'up' | 'down';

function StatusDot({ state }: { state: State }) {
  return (
    <span
      className={cn(
        'inline-block h-3 w-3 rounded-full',
        state === 'up' && 'bg-green-500',
        state === 'down' && 'bg-red-500',
        state === 'checking' && 'bg-yellow-400',
      )}
    />
  );
}

function label(state: State): string {
  if (state === 'up') return 'operacional';
  if (state === 'down') return 'indisponível';
  return 'a verificar...';
}

export default function HomePage() {
  const [api, setApi] = useState<State>('checking');
  const [db, setDb] = useState<State>('checking');

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((r) => setApi(r.ok ? 'up' : 'down'))
      .catch(() => setApi('down'));

    fetch(`${API_URL}/health/ready`)
      .then((r) => setDb(r.ok ? 'up' : 'down'))
      .catch(() => setDb('down'));
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 px-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">FrontRest IA</h1>
        <p className="mt-1 text-neutral-500">
          Fase 1 — fundação técnica sobre <strong>FrontCore</strong> a correr.
        </p>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-400">
          Estado dos serviços
        </h2>
        <ul className="space-y-3">
          <li className="flex items-center justify-between">
            <span>API (NestJS)</span>
            <span className="flex items-center gap-2 text-sm text-neutral-600">
              <StatusDot state={api} /> {label(api)}
            </span>
          </li>
          <li className="flex items-center justify-between">
            <span>Base de dados (PostgreSQL via API)</span>
            <span className="flex items-center gap-2 text-sm text-neutral-600">
              <StatusDot state={db} /> {label(db)}
            </span>
          </li>
        </ul>
      </div>

      <p className="text-xs text-neutral-400">
        API: <code>{API_URL}</code>
      </p>

      <div className="flex gap-3">
        <a
          href="/login"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
        >
          Entrar
        </a>
        <a
          href="/register"
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium"
        >
          Criar conta
        </a>
      </div>
    </main>
  );
}
