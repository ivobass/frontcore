'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Typography,
  Button,
  Input,
  FormField,
  FieldLabel,
  FieldError,
} from '@frontcore/ui';
import { login, saveSession } from '../../../lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const session = await login({ email, password });
      saveSession(session);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao entrar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div>
        <Typography variant="h2" as="h1">
          Entrar
        </Typography>
        <Typography variant="muted">FrontRest IA</Typography>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </FormField>
        <FormField>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </FormField>
        {error ? <FieldError>{error}</FieldError> : null}
        <Button type="submit" disabled={loading}>
          {loading ? 'A entrar...' : 'Entrar'}
        </Button>
      </form>

      <Typography variant="muted">
        Não tens conta?{' '}
        <a href="/register" className="underline">
          Criar conta
        </a>
      </Typography>
    </>
  );
}
