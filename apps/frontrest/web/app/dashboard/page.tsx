'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, clearSession, logout, fetchMe } from '../../lib/auth';

export default function DashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.push('/login');
      return;
    }
    fetchMe(session.accessToken)
      .then(setMe)
      .catch(() => {
        clearSession();
        router.push('/login');
      });
  }, [router]);

  async function handleLogout() {
    const session = getSession();
    if (session) await logout(session.refreshToken);
    clearSession();
    router.push('/login');
  }

  if (error) {
    return <p className="p-6 text-sm text-red-600">{error}</p>;
  }

  if (!me) {
    return <p className="p-6 text-sm text-neutral-500">A carregar...</p>;
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <button
          onClick={handleLogout}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
        >
          Sair
        </button>
      </div>

      <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-neutral-500">Organização</p>
        <p className="text-lg font-medium">{me.organization.name}</p>
        <p className="mt-4 text-sm text-neutral-500">Utilizador</p>
        <p className="text-lg font-medium">
          {me.user.name} ({me.user.email})
        </p>
        <p className="mt-4 text-sm text-neutral-500">Role</p>
        <p className="text-lg font-medium">{me.role}</p>
      </div>
    </main>
  );
}
