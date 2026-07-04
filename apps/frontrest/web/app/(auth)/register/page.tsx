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
import { register, saveSession } from '../../../lib/auth';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const session = await register({
        name,
        organizationName,
        email,
        password,
      });
      saveSession(session);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar conta.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div>
        <Typography variant="h2" as="h1">
          Criar conta
        </Typography>
        <Typography variant="muted">FrontRest IA</Typography>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField>
          <FieldLabel htmlFor="name">O teu nome</FieldLabel>
          <Input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </FormField>
        <FormField>
          <FieldLabel htmlFor="organizationName">
            Nome do restaurante / organização
          </FieldLabel>
          <Input
            id="organizationName"
            type="text"
            required
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
          />
        </FormField>
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
          <FieldLabel htmlFor="password">Password (mín. 8 caracteres)</FieldLabel>
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
          {loading ? 'A criar...' : 'Criar conta'}
        </Button>
      </form>

      <Typography variant="muted">
        Já tens conta?{' '}
        <a href="/login" className="underline">
          Entrar
        </a>
      </Typography>
    </>
  );
}
