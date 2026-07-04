'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Typography,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  cn,
  buttonVariants,
} from '@frontcore/ui';
import { API_URL } from '../lib/api';

type State = 'checking' | 'up' | 'down';

function StatusDot({ state }: { state: State }) {
  return (
    <span
      className={cn(
        'inline-block h-3 w-3 rounded-full',
        state === 'up' && 'bg-success',
        state === 'down' && 'bg-destructive',
        state === 'checking' && 'bg-warning',
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
        <Typography variant="h1">FrontRest IA</Typography>
        <Typography variant="muted" className="mt-1">
          Fase 1 — fundação técnica sobre <strong>FrontCore</strong> a correr.
        </Typography>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
            Estado dos serviços
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span>API (NestJS)</span>
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <StatusDot state={api} /> {label(api)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Base de dados (PostgreSQL via API)</span>
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <StatusDot state={db} /> {label(db)}
            </span>
          </div>
        </CardContent>
      </Card>

      <Typography variant="muted" className="text-xs">
        API: <code>{API_URL}</code>
      </Typography>

      <div className="flex gap-3">
        <Link href="/login" className={cn(buttonVariants({ variant: 'primary' }))}>
          Entrar
        </Link>
        <Link
          href="/register"
          className={cn(buttonVariants({ variant: 'outline' }))}
        >
          Criar conta
        </Link>
      </div>
    </main>
  );
}
